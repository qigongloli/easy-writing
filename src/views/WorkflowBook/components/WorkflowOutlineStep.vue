<template>
  <div class="workflow-outline-step">
    <section class="design-panel outline-result-panel">
      <div class="design-panel__title outline-panel-heading">
        <i class="fa-solid fa-wand-magic-sparkles"></i>
        <span>AI 生成大纲结果</span>
      </div>

      <p v-if="readonly" class="outline-readonly-hint">
        <i class="fa-solid fa-circle-info"></i>
        正在生成调整候选，当前大纲暂时只读；候选应用前不会覆盖这里的内容。
      </p>

      <section class="outline-section">
        <h3>推荐书名</h3>
        <div class="outline-title-options">
          <span
            v-for="titleOption in outline.titleOptions"
            :key="titleOption.id"
            class="outline-title-chip"
            :class="{ selected: outline.selectedTitleId === titleOption.id }"
          >
            <WorkflowInlineEdit
              :model-value="titleOption.name"
              class="outline-surface-inline-edit"
              compact
              :disabled="readonly"
              @edit-start="selectTitle(titleOption.id)"
              @update:model-value="updateTitleOption(titleOption.id, $event)"
            />
          </span>
          <span v-if="isGroupUpdated('title')" class="outline-updated-tag">已更新</span>
        </div>
      </section>

      <section class="outline-section">
        <h3>
          故事亮点 / 核心冲突
          <span v-if="isUpdated('storyHook')" class="outline-updated-tag">已更新</span>
        </h3>
        <WorkflowInlineEdit
          :model-value="outline.storyHook"
          block
          multiline
          :rows="4"
          :disabled="readonly"
          @update:model-value="patchOutline({ storyHook: $event })"
        />
      </section>

      <section class="outline-section">
        <h3>世界概览</h3>
        <ul class="outline-world-list">
          <li v-for="(item, index) in outline.worldItems" :key="`world-${index}`">
            <span>•</span>
            <WorkflowInlineEdit
              :model-value="item"
              block
              :disabled="readonly"
              @update:model-value="updateWorldItem(index, $event)"
            />
            <span v-if="isUpdated(`world:${index}`)" class="outline-updated-tag">已更新</span>
          </li>
        </ul>
      </section>

      <section class="outline-section">
        <h3>卷纲概览</h3>
        <div class="outline-volume-flow">
          <article
            v-for="volume in outline.volumes"
            :key="volume.id"
            class="outline-volume-card"
            :class="{ selected: outline.selectedVolumeId === volume.id }"
            @click="selectVolume(volume.id)"
          >
            <WorkflowInlineEdit
              :model-value="volume.title"
              class="outline-surface-inline-edit"
              compact
              multiline
              :rows="2"
              :disabled="readonly"
              @edit-start="selectVolume(volume.id)"
              @update:model-value="updateVolume(volume.id, { title: $event })"
            />
            <span v-if="isUpdated(`volume:${volume.id}`)" class="outline-updated-tag">已更新</span>
            <WorkflowInlineEdit
              :model-value="volume.summary"
              class="outline-surface-inline-edit"
              compact
              multiline
              :rows="2"
              :disabled="readonly"
              @edit-start="selectVolume(volume.id)"
              @update:model-value="updateVolume(volume.id, { summary: $event })"
            />
          </article>
        </div>
      </section>

      <section v-if="selectedVolume?.stages.length" class="outline-section outline-stage-section">
        <div class="outline-section-title-row">
          <h3>阶段锚点（{{ selectedVolumeTitle }}）</h3>
          <div class="outline-dynamic-range">
            <span>预计</span>
            <input
              type="number"
              :value="selectedVolume.chapterRange.min"
              :min="1"
              :max="selectedVolume.chapterRange.max"
              :disabled="readonly"
              @change="updateVolumeRange('min', $event)"
            />
            <span>–</span>
            <input
              type="number"
              :value="selectedVolume.chapterRange.max"
              :min="selectedVolume.chapterRange.min"
              :disabled="readonly"
              @change="updateVolumeRange('max', $event)"
            />
            <span>章，可随剧情调整</span>
          </div>
        </div>
        <p class="outline-stage-section__hint">阶段按目标和状态依次推进，不再用固定章数强行卡死卷末。</p>
        <div class="outline-stage-list">
          <article
            v-for="(stage, stageIndex) in selectedVolume.stages"
            :key="stage.id"
            class="outline-stage-card"
          >
            <header class="outline-stage-card__head">
              <WorkflowInlineEdit
                :model-value="stage.title"
                class="outline-stage-card__title"
                compact
                :disabled="readonly"
                @update:model-value="updateStage(stageIndex, { title: $event })"
              />
              <span class="outline-stage-order">阶段 {{ stageIndex + 1 }} / {{ selectedVolume.stages.length }}</span>
            </header>
            <div class="outline-stage-fields">
              <label>
                <span>阶段目标</span>
                <WorkflowInlineEdit
                  :model-value="stage.goal"
                  block
                  multiline
                  :rows="2"
                  :disabled="readonly"
                  @update:model-value="updateStage(stageIndex, { goal: $event })"
                />
              </label>
              <label>
                <span>开始状态</span>
                <WorkflowInlineEdit
                  :model-value="stage.startState"
                  block
                  multiline
                  :rows="2"
                  :disabled="readonly"
                  @update:model-value="updateStage(stageIndex, { startState: $event })"
                />
              </label>
              <label>
                <span>结束状态</span>
                <WorkflowInlineEdit
                  :model-value="stage.endState"
                  block
                  multiline
                  :rows="2"
                  :disabled="readonly"
                  @update:model-value="updateStage(stageIndex, { endState: $event })"
                />
              </label>
              <label>
                <span>必须完成</span>
                <WorkflowInlineEdit
                  :model-value="stageListText(stage.mustHappen)"
                  placeholder="多项用换行或分号分隔"
                  block
                  multiline
                  :rows="2"
                  :disabled="readonly"
                  @update:model-value="updateStageList(stageIndex, 'mustHappen', $event)"
                />
              </label>
              <label>
                <span>本阶段禁止</span>
                <WorkflowInlineEdit
                  :model-value="stageListText(stage.forbidden)"
                  placeholder="禁止提前、重复或拖延的剧情"
                  block
                  multiline
                  :rows="2"
                  :disabled="readonly"
                  @update:model-value="updateStageList(stageIndex, 'forbidden', $event)"
                />
              </label>
              <label>
                <span>允许新增</span>
                <WorkflowInlineEdit
                  :model-value="stageListText(stage.allowedNewElements)"
                  placeholder="允许首次出现的重要人物、能力、道具或势力"
                  block
                  multiline
                  :rows="2"
                  :disabled="readonly"
                  @update:model-value="updateStageList(stageIndex, 'allowedNewElements', $event)"
                />
              </label>
            </div>
          </article>
        </div>
      </section>

      <section class="outline-section">
        <div class="outline-section-title-row">
          <h3>章节大纲预览（{{ selectedVolumeTitle }}）</h3>
        </div>
        <div class="outline-chapter-grid">
          <div
            v-for="chapter in selectedVolumeRealChapters"
            :key="chapter.id"
            class="outline-chapter-row"
          >
            <WorkflowInlineEdit
              :model-value="chapter.title"
              class="outline-chapter-title"
              block
              :disabled="readonly"
              @update:model-value="updateChapter(chapter.id, { title: $event })"
            />
            <WorkflowInlineEdit
              :model-value="chapter.summary"
              class="outline-chapter-summary"
              placeholder="补充本章摘要"
              block
              multiline
              :rows="2"
              :disabled="readonly"
              @update:model-value="updateChapter(chapter.id, { summary: $event })"
            />
          </div>
        </div>
        <!-- 占位章不逐条铺开（内容彼此雷同没有信息量），聚合说明 + 可展开手动补写。 -->
        <div v-if="selectedVolumePlaceholderChapters.length" class="outline-chapter-pending">
          <div class="outline-chapter-pending__head">
            <i class="fa-solid fa-wand-magic-sparkles"></i>
            <span>其余 {{ selectedVolumePlaceholderChapters.length }} 章 · 待生成</span>
            <button type="button" @click="showPlaceholderChapters = !showPlaceholderChapters">
              {{ showPlaceholderChapters ? '收起' : '展开查看' }}
            </button>
          </div>
          <p class="outline-chapter-pending__desc">
            写作本卷时，AI 会承接以上关键剧情与已写正文，为这些章节逐章生成不重复的章名与详细章纲；也可以展开后手动指定某几章的内容，手动修改过的章节不会被 AI 覆盖。
          </p>
          <div v-if="showPlaceholderChapters" class="outline-chapter-grid">
            <div
              v-for="chapter in selectedVolumePlaceholderChapters"
              :key="chapter.id"
              class="outline-chapter-row outline-chapter-row--pending"
            >
              <WorkflowInlineEdit
                :model-value="chapter.title"
                class="outline-chapter-title"
                block
                :disabled="readonly"
                @update:model-value="updateChapter(chapter.id, { title: $event })"
              />
              <WorkflowInlineEdit
                :model-value="chapter.summary"
                class="outline-chapter-summary"
                placeholder="补充本章摘要"
                block
                multiline
                :rows="2"
                :disabled="readonly"
                @update:model-value="updateChapter(chapter.id, { summary: $event })"
              />
            </div>
          </div>
        </div>
      </section>
    </section>

    <aside class="outline-side-stack">
      <section class="design-panel outline-config-panel">
        <div class="design-panel__title outline-panel-heading">
          <i class="fa-solid fa-clipboard-list"></i>
          <span>当前配置信息</span>
        </div>
        <dl class="outline-config-list">
          <div>
            <dt>书名</dt>
            <dd>
              <WorkflowInlineEdit
                :model-value="selectedTitleName"
                placeholder="填写书名"
                block
                :disabled="readonly"
                @update:model-value="updateSelectedTitleName"
              />
            </dd>
          </div>
          <div>
            <dt>简介</dt>
            <dd>
              <WorkflowInlineEdit
                :model-value="outline.intro"
                placeholder="补充作品简介"
                block
                multiline
                :rows="5"
                :disabled="readonly"
                @update:model-value="patchOutline({ intro: $event })"
              />
            </dd>
          </div>
          <div
            v-for="(item, index) in outline.infoItems"
            :key="item.label"
          >
            <dt>{{ item.label }}</dt>
            <dd>
              <WorkflowInlineEdit
                :model-value="item.value"
                block
                :disabled="readonly"
                @update:model-value="updateInfoItem(index, $event)"
              />
            </dd>
          </div>
        </dl>
        <div class="outline-action-stack">
          <button
            class="outline-adjust-entry"
            type="button"
            :disabled="busy"
            @click="$emit('adjust')"
          >
            <i class="fa-solid fa-wand-magic-sparkles"></i>
            按要求调整大纲
          </button>
          <button
            class="outline-regenerate-btn"
            type="button"
            :disabled="busy"
            @click="$emit('regenerate')"
          >
            <i class="fa-solid fa-rotate-right"></i>
            直接重新生成
          </button>
          <p class="outline-action-hint">
            <i class="fa-solid fa-circle-info"></i>
            先生成候选，不会覆盖当前版本
          </p>
        </div>
      </section>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import WorkflowInlineEdit from './WorkflowInlineEdit.vue'
import type {
  WorkflowDraft,
  WorkflowOutlineChapter,
  WorkflowOutlineResult,
  WorkflowOutlineStage,
  WorkflowOutlineVolume,
} from '../types'

const props = withDefaults(defineProps<{
  draft: WorkflowDraft
  /** 生成候选期间大纲只读，避免应用候选时与手动编辑互相覆盖 */
  readonly?: boolean
  /** 有生成任务在跑时禁用两个入口 */
  busy?: boolean
  /** 本次应用候选改动过的字段，用于「已更新」角标；由父级定时清空，不常驻 */
  updatedKeys?: string[]
}>(), {
  readonly: false,
  busy: false,
  updatedKeys: () => [],
})
const emit = defineEmits<{
  (event: 'patch', payload: Partial<WorkflowDraft>): void
  (event: 'regenerate'): void
  (event: 'adjust'): void
}>()

const outline = computed(() => props.draft.outlineResult)
const isUpdated = (key: string) => props.updatedKeys.includes(key)
// 书名整批替换会产生 title:0、title:1…多条变更，区块角标按前缀匹配。
const isGroupUpdated = (prefix: string) => props.updatedKeys.some(
  key => key === prefix || key.startsWith(`${prefix}:`)
)
const selectedVolume = computed(() => outline.value.volumes.find(item => item.id === outline.value.selectedVolumeId) || null)
const selectedVolumeTitle = computed(() => selectedVolume.value?.title || '当前卷')
const selectedVolumeChapters = computed(() => outline.value.chapters.filter(item => item.volumeId === outline.value.selectedVolumeId))
const selectedVolumeRealChapters = computed(() => selectedVolumeChapters.value.filter(item => !item.expanded))
const selectedVolumePlaceholderChapters = computed(() => selectedVolumeChapters.value.filter(item => item.expanded))
const showPlaceholderChapters = ref(false)

const patchOutline = (payload: Partial<WorkflowOutlineResult>) => {
  emit('patch', {
    outlineResult: {
      ...props.draft.outlineResult,
      ...payload,
    },
  })
}

const selectTitle = (titleId: string) => {
  patchOutline({ selectedTitleId: titleId })
}

const selectVolume = (volumeId: string) => {
  showPlaceholderChapters.value = false
  patchOutline({ selectedVolumeId: volumeId })
}

const selectedTitleName = computed(() => {
  const options = outline.value.titleOptions
  return options.find(item => item.id === outline.value.selectedTitleId)?.name || options[0]?.name || ''
})

const updateTitleOption = (titleId: string, name: string) => {
  patchOutline({
    titleOptions: outline.value.titleOptions.map(item => (item.id === titleId ? { ...item, name } : item)),
    selectedTitleId: titleId,
  })
}

// 右侧「书名」改的就是当前选中的那条候选，不再单独维护一份副本。
const updateSelectedTitleName = (name: string) => {
  const targetId = outline.value.selectedTitleId || outline.value.titleOptions[0]?.id
  if (!targetId) return
  updateTitleOption(targetId, name)
}

const updateWorldItem = (index: number, value: string) => {
  const worldItems = [...outline.value.worldItems]
  worldItems[index] = value
  patchOutline({ worldItems })
}

const updateVolume = (
  volumeId: string,
  payload: Partial<Pick<WorkflowOutlineVolume, 'title' | 'summary' | 'chapterCount' | 'chapterCountMode' | 'chapterRange'>>,
) => {
  patchOutline({
    volumes: outline.value.volumes.map(item => (item.id === volumeId ? { ...item, ...payload } : item)),
  })
}

const updateVolumeRange = (key: 'min' | 'max', event: Event) => {
  const volume = selectedVolume.value
  const input = event.target as HTMLInputElement | null
  if (!volume || !input) return
  const requested = Math.max(1, Math.round(Number(input.value || 0)))
  if (!Number.isFinite(requested)) return
  const chapterRange = { ...volume.chapterRange }
  if (key === 'min') chapterRange.min = Math.min(requested, chapterRange.max)
  else chapterRange.max = Math.max(requested, chapterRange.min)
  updateVolume(volume.id, {
    chapterRange,
    chapterCountMode: 'dynamic',
    chapterCount: Math.round((chapterRange.min + chapterRange.max) / 2),
  })
}

const stageListText = (value: string[]) => value.join('；')

const parseStageList = (value: string) => Array.from(new Set(
  String(value || '')
    .split(/[\n；;]+/)
    .map(item => item.trim())
    .filter(Boolean),
)).slice(0, 8)

const replaceSelectedVolumeStages = (stages: WorkflowOutlineStage[]) => {
  const volume = selectedVolume.value
  if (!volume) return
  patchOutline({
    volumes: outline.value.volumes.map(item => (
      item.id === volume.id ? { ...item, stages } : item
    )),
  })
}

const updateStage = (index: number, payload: Partial<WorkflowOutlineStage>) => {
  const volume = selectedVolume.value
  if (!volume?.stages[index]) return
  replaceSelectedVolumeStages(volume.stages.map((stage, stageIndex) => (
    stageIndex === index ? { ...stage, ...payload } : stage
  )))
}

const updateStageList = (
  index: number,
  key: 'mustHappen' | 'forbidden' | 'allowedNewElements',
  value: string,
) => updateStage(index, { [key]: parseStageList(value) })

const updateChapter = (chapterId: string, payload: Partial<Pick<WorkflowOutlineChapter, 'title' | 'summary'>>) => {
  const target = outline.value.chapters.find(item => item.id === chapterId)
  // 内容没有真正改变就不落 patch：清除占位标记等于宣告"这一章用户已经写好了"，
  // 写作该卷时 AI 不再为它生成章纲，误触的代价是一个没有章纲的空章。
  const changed = target
    && (Object.entries(payload) as Array<[keyof WorkflowOutlineChapter, string]>)
      .some(([key, value]) => target[key] !== value)
  if (!changed) return
  patchOutline({
    // 手动编辑过的章节视为真实章纲，清除占位标记，写作该卷时不再被 AI 章纲覆盖。
    chapters: outline.value.chapters.map(item => (item.id === chapterId ? { ...item, ...payload, expanded: false } : item)),
  })
}

const updateInfoItem = (index: number, value: string) => {
  patchOutline({
    infoItems: outline.value.infoItems.map((item, itemIndex) => (
      itemIndex === index ? { ...item, value } : item
    )),
  })
}
</script>
