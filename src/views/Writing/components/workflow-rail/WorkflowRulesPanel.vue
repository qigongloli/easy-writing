<template>
  <section class="rail-form-panel" aria-label="写作规则">
    <div class="rail-form-body custom-scroll">
      <div v-if="!run" class="rail-form-empty">
        <i class="fa-regular fa-folder-open"></i>
        <strong>暂无可编辑的写作规则</strong>
        <span>工作流准备完成后，可在这里约束后续章节。</span>
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
            @click="discard"
          >
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <section class="rail-form-section">
          <div class="rail-form-section-title">
            <strong>写作规则</strong>
            <span>你的硬性要求，优先级高于系统写作建议；输出格式与内容安全底线除外。</span>
          </div>
          <div class="rail-textarea-wrap">
            <textarea
              v-model="draft.writingRules"
              class="ink-input rail-textarea rules-textarea"
              rows="6"
              :maxlength="WRITING_RULES_MAX_LEN"
              placeholder="每行一条硬性要求，例如：&#10;主角不许无脑善良，先自保再救人&#10;每章至少一场正面冲突&#10;不许出现现代网络流行语"
              :disabled="formDisabled"
            ></textarea>
            <span class="rail-textarea-count">{{ draft.writingRules.length }} / {{ WRITING_RULES_MAX_LEN }}</span>
          </div>
        </section>

        <section class="rail-form-section">
          <div class="rail-form-section-title">
            <strong>文风与叙事</strong>
            <span>语言气质与叙事框架，与写作规则一起参与后续章节生成。</span>
          </div>

          <el-form :model="draft" label-position="top" class="rail-form-grid">
            <el-form-item label="文风要求">
              <div class="rail-textarea-wrap">
                <textarea
                  v-model="draft.writingStyle"
                  class="ink-input rail-textarea"
                  rows="3"
                  :maxlength="WRITING_STYLE_MAX_LEN"
                  placeholder="语言节奏、描写密度、对白和表达偏好"
                  :disabled="formDisabled"
                ></textarea>
                <span class="rail-textarea-count">{{ draft.writingStyle.length }} / {{ WRITING_STYLE_MAX_LEN }}</span>
              </div>
            </el-form-item>
          </el-form>

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
            <el-form-item label="叙事风格">
              <el-select
                v-model="draft.narrativeStyle"
                class="ink-select"
                popper-class="ink-select-popper"
                placeholder="选择或输入叙事风格"
                filterable
                allow-create
                default-first-option
                clearable
                fit-input-width
                :disabled="formDisabled"
              >
                <el-option v-for="style in narrativeStyleOptions" :key="style" :label="style" :value="style" />
              </el-select>
            </el-form-item>

            <el-form-item label="叙事视角">
              <el-select
                v-model="draft.storyPerspective"
                class="ink-select"
                popper-class="ink-select-popper"
                placeholder="请选择叙事视角"
                clearable
                fit-input-width
                :loading="resourcesLoading"
                :disabled="resourceFieldDisabled"
              >
                <el-option
                  v-for="perspective in storyPerspectiveOptions"
                  :key="perspective"
                  :label="perspective"
                  :value="perspective"
                />
              </el-select>
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
          @click="discard"
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
import type { WorkflowRun, WorkflowRuntimeSettings } from '@/types/workflow'
import type { WorkflowRuntimeConfigUpdate } from './rail'
import {
  createRunConfigReader,
  useRuntimeDraft,
  useWorkflowResources,
} from './runtime-settings'

/** 写作规则长度上限（与服务端约定） */
const WRITING_RULES_MAX_LEN = 1000
const WRITING_STYLE_MAX_LEN = 1500

interface RulesDraft extends Record<string, string> {
  writingRules: string
  writingStyle: string
  narrativeStyle: string
  storyPerspective: string
}

const props = withDefaults(defineProps<{
  run: WorkflowRun | null
  saving?: boolean
}>(), {
  saving: false,
})

const emit = defineEmits<{
  (event: 'apply', payload: WorkflowRuntimeConfigUpdate): void
}>()

const presetNarrativeStyleOptions = [
  '顺叙推进',
  '双线交织',
  '多线群像',
  '倒叙悬念',
  '单元剧结构',
]

const buildDraft = (run: WorkflowRun | null): RulesDraft => {
  const reader = createRunConfigReader(run)
  if (!reader) {
    return { writingRules: '', writingStyle: '', narrativeStyle: '', storyPerspective: '' }
  }
  return {
    writingRules: reader.readConfigText('writingRules'),
    writingStyle: reader.readConfigText('writingStyle'),
    narrativeStyle: reader.readConfigText('narrativeStyle', reader.tags.join('、')),
    storyPerspective: reader.readConfigText('storyPerspective'),
  }
}

const runRef = toRef(props, 'run')
const { draft, changedCount, discard, markSubmitted, buildPatch } = useRuntimeDraft(runRef, buildDraft)

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
const narrativeStyleOptions = computed(() =>
  [...new Set([...(resources.value?.tags || []), ...presetNarrativeStyleOptions])]
)
const storyPerspectiveOptions = computed(() =>
  resources.value?.selectFields.find(field => field.key === 'storyPerspective')?.options || []
)

const applyChanges = () => {
  if (!props.run || props.saving || !changedCount.value) return
  const next: RulesDraft = {
    writingRules: draft.writingRules.trim().slice(0, WRITING_RULES_MAX_LEN),
    writingStyle: draft.writingStyle.trim().slice(0, WRITING_STYLE_MAX_LEN),
    narrativeStyle: draft.narrativeStyle.trim(),
    storyPerspective: draft.storyPerspective.trim(),
  }
  // 补丁语义：只提交真实变化字段，避免覆盖其他面板的待生效配置
  const config = buildPatch(next) as Partial<WorkflowRuntimeSettings>
  markSubmitted(next)
  emit('apply', { config, effectiveScope: 'next_chapter' })
}

onMounted(loadResources)
</script>

<style scoped lang="scss">
@use './rail-form';

.rules-textarea {
  min-height: 128px;
}
</style>
