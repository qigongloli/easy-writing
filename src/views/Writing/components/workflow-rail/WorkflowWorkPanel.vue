<template>
  <section class="rail-form-panel" aria-label="作品设定">
    <div class="rail-form-body custom-scroll">
      <div v-if="!run" class="rail-form-empty">
        <i class="fa-regular fa-folder-open"></i>
        <strong>暂无可编辑的作品设定</strong>
        <span>工作流准备完成后，可在这里调整后续章节。</span>
      </div>

      <template v-else>
        <div v-if="saving || changedCount" class="rail-form-notice">
          <span>
            <i :class="saving ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-pen-to-square'"></i>
            {{ saving ? '正在保存并应用' : `${changedCount} 项修改待应用` }}
          </span>
          <button
            v-if="!saving"
            type="button"
            class="ink-btn ink-btn-ghost ink-btn-sm rail-form-icon-button"
            aria-label="放弃全部修改"
            @click="discardAll"
          >
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <section class="rail-form-section">
          <div class="rail-form-section-title">
            <strong>作品定位</strong>
            <span>这些设置会参与后续章节规划与正文生成。</span>
          </div>

          <div v-if="resourcesLoading" class="rail-resource-state">
            <i class="fa-solid fa-spinner fa-spin"></i>
            正在加载可选项
          </div>
          <div v-else-if="resourcesError" class="rail-resource-state is-error">
            <span>
              <i class="fa-solid fa-circle-exclamation"></i>
              {{ resourcesError }}
            </span>
            <button
              type="button"
              class="ink-btn ink-btn-ghost ink-btn-sm"
              :disabled="saving"
              @click="loadResources"
            >
              重新加载
            </button>
          </div>

          <el-form
            :model="draft"
            label-position="left"
            label-width="68px"
            class="rail-form-grid rail-form-inline"
          >
            <el-form-item label="发布平台">
              <el-select
                v-model="draft.platform"
                class="ink-select"
                popper-class="ink-select-popper"
                placeholder="请选择发布平台"
                filterable
                clearable
                fit-input-width
                :loading="resourcesLoading"
                :disabled="resourceFieldDisabled"
              >
                <el-option
                  v-for="platform in platformOptions"
                  :key="platform.code"
                  :label="platform.name"
                  :value="platform.name"
                />
              </el-select>
            </el-form-item>

            <el-form-item label="作品分类">
              <el-select
                v-model="draft.genre"
                class="ink-select"
                popper-class="ink-select-popper"
                placeholder="请选择作品分类"
                filterable
                clearable
                fit-input-width
                :loading="resourcesLoading"
                :disabled="resourceFieldDisabled"
              >
                <el-option v-for="genre in genreOptions" :key="genre" :label="genre" :value="genre" />
              </el-select>
            </el-form-item>
          </el-form>
        </section>

        <section class="rail-form-section">
          <div class="rail-form-section-title">
            <strong>故事骨架</strong>
            <span>用于补充或覆盖后续章节必须遵守的故事约束。</span>
          </div>

          <el-form :model="draft" label-position="top" class="rail-form-grid">
            <el-form-item label="核心设定">
              <div class="rail-textarea-wrap">
                <textarea
                  v-model="draft.coreSetting"
                  class="ink-input rail-textarea"
                  rows="3"
                  :maxlength="STORY_TEXT_MAX_LEN"
                  placeholder="人物目标、世界规则和不可违背的限制"
                  :disabled="formDisabled"
                ></textarea>
                <span class="rail-textarea-count">{{ draft.coreSetting.length }} / {{ STORY_TEXT_MAX_LEN }}</span>
              </div>
            </el-form-item>
            <el-form-item label="故事主线">
              <div class="rail-textarea-wrap">
                <textarea
                  v-model="draft.storyLine"
                  class="ink-input rail-textarea"
                  rows="3"
                  :maxlength="STORY_TEXT_MAX_LEN"
                  placeholder="后续章节需要持续推进的主要矛盾和目标"
                  :disabled="formDisabled"
                ></textarea>
                <span class="rail-textarea-count">{{ draft.storyLine.length }} / {{ STORY_TEXT_MAX_LEN }}</span>
              </div>
            </el-form-item>
          </el-form>
        </section>

        <section class="rail-form-section">
          <div class="rail-form-section-title">
            <strong>写作模型</strong>
            <span>保存后从下一章生效，当前正在生成的章节保持原设置。</span>
          </div>

          <el-form label-position="left" label-width="68px" class="rail-form-grid rail-form-inline">
            <el-form-item label="写作模型">
              <ModelChip
                v-model="draft.modelCode"
                group-code="workflow_book"
                scope="book"
                :disabled="formDisabled"
              />
            </el-form-item>
          </el-form>
        </section>
      </template>
    </div>

    <footer class="rail-form-footer">
      <p class="rail-form-footer-hint">保存后自下一章生效，正在生成的章节不受影响。</p>
      <div class="rail-form-footer-actions">
        <button
          type="button"
          class="ink-btn ink-btn-outline"
          :disabled="formDisabled || !changedCount"
          @click="discardAll"
        >
          放弃修改
        </button>
        <button
          type="button"
          class="ink-btn ink-btn-primary"
          :disabled="saving || !run || !changedCount"
          @click="applyChanges"
        >
          <i v-if="saving" class="fa-solid fa-spinner fa-spin"></i>
          {{ saving ? '正在保存' : '保存并应用' }}
        </button>
      </div>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, toRef } from 'vue'
import { inkConfirm } from '@/utils/ink-confirm'
import ModelChip from '@/components/ModelChip.vue'
import type { WorkflowRun, WorkflowRuntimeSettings } from '@/types/workflow'
import type { WorkflowRuntimeConfigUpdate } from './rail'
import {
  buildInitialCoreSetting,
  buildInitialStoryLine,
  createRunConfigReader,
  useRuntimeDraft,
  useWorkflowResources,
} from './runtime-settings'

/** 核心设定/故事主线长度上限（与原设定页签一致） */
const STORY_TEXT_MAX_LEN = 2000

interface WorkDraft extends Record<string, string> {
  platform: string
  genre: string
  coreSetting: string
  storyLine: string
  modelCode: string
}

const props = withDefaults(defineProps<{
  run: WorkflowRun | null
  saving?: boolean
  hasContent?: boolean
  reviewRequired?: boolean
}>(), {
  saving: false,
  hasContent: false,
  reviewRequired: false,
})

const emit = defineEmits<{
  (event: 'apply', payload: WorkflowRuntimeConfigUpdate): void
}>()

const buildDraft = (run: WorkflowRun | null): WorkDraft => {
  const reader = createRunConfigReader(run)
  if (!reader) {
    return { platform: '', genre: '', coreSetting: '', storyLine: '', modelCode: '' }
  }
  return {
    platform: reader.readConfigText('platform'),
    genre: reader.readConfigText('genre'),
    coreSetting: reader.readConfigText('coreSetting', buildInitialCoreSetting(reader.setting)),
    storyLine: reader.readConfigText('storyLine', buildInitialStoryLine(reader.setting)),
    modelCode: reader.modelCode,
  }
}

const runRef = toRef(props, 'run')
const { draft, baseline, changedCount, discard, markSubmitted, clearSubmitted, buildPatch } =
  useRuntimeDraft(runRef, buildDraft)

const {
  resources,
  loading: resourcesLoading,
  error: resourcesError,
  load: loadResources,
} = useWorkflowResources()

const formDisabled = computed(() => !props.run || props.saving)
const resourceFieldDisabled = computed(() =>
  formDisabled.value || resourcesLoading.value || Boolean(resourcesError.value)
)
const platformOptions = computed(() => resources.value?.platforms || [])
const genreOptions = computed(() => resources.value?.genres || [])

const discardAll = () => discard()

const applyChanges = async () => {
  if (!props.run || props.saving || !changedCount.value) return
  const next: WorkDraft = {
    platform: draft.platform.trim(),
    genre: draft.genre.trim(),
    coreSetting: draft.coreSetting.trim().slice(0, STORY_TEXT_MAX_LEN),
    storyLine: draft.storyLine.trim().slice(0, STORY_TEXT_MAX_LEN),
    modelCode: draft.modelCode.trim(),
  }
  // 补丁语义：只提交真实变化字段，避免覆盖其他面板的待生效配置
  const patch = buildPatch(next)
  const modelCode = patch.modelCode
  delete patch.modelCode
  const config = patch as Partial<WorkflowRuntimeSettings>

  if (modelCode !== undefined && props.hasContent) {
    const reviewTip = props.reviewRequired
      ? '当前待确认正文仍按原候选模型归档；如果选择重写，新稿才使用新模型。'
      : ''
    try {
      await inkConfirm(
        `切换后，后续内容可能在文风、节奏、人物语气和细节密度上变化。已生成内容不会被修改，当前正在生成的章节仍使用原模型，新模型从下一章生效。${reviewTip}`,
        '确认切换写作模型',
        {
          confirmButtonText: '切换并保存',
          cancelButtonText: '取消',
          type: 'warning',
        }
      )
    } catch {
      draft.modelCode = baseline.value.modelCode
      clearSubmitted()
      return
    }
  }
  markSubmitted(next)
  emit('apply', {
    ...(modelCode !== undefined ? { modelCode } : {}),
    config,
    effectiveScope: 'next_chapter',
  })
}

onMounted(loadResources)
</script>

<style scoped lang="scss">
@use './rail-form';
</style>
