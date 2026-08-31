<template>
  <div class="workflow-setting-step">
    <section class="design-panel setting-editor-panel">
      <div class="setting-panel-head">
        <div class="design-panel__title">
          <i class="fa-solid fa-wand-magic-sparkles"></i>
          <span>设定生成与编辑</span>
        </div>
      </div>

      <!-- 大纲变更后设定不再被清空，只提示可能对不上，由用户决定要不要重生 -->
      <p v-if="stale" class="setting-stale-tip">
        <i class="fa-solid fa-triangle-exclamation"></i>
        大纲已变更，当前设定可能与新大纲对不上，建议复查或重新生成。
      </p>

      <div class="setting-tab-row">
        <button
          v-for="tab in settingTabs"
          :key="tab.value"
          :class="{ active: activeTab === tab.value }"
          type="button"
          @click="activeTab = tab.value"
        >
          {{ tab.label }}
        </button>

        <!-- 变长列表才有新增；世界背景与核心设定是固定结构 -->
        <button
          v-if="addActionLabel"
          class="setting-tab-action"
          type="button"
          @click="handleAdd"
        >
          <i class="fa-solid fa-circle-plus"></i>
          {{ addActionLabel }}
        </button>
      </div>

      <div class="setting-tab-body">
        <SettingWorldTab
          v-if="activeTab === 'world'"
          :cards="setting.worldCards"
          @update="patchSetting({ worldCards: $event })"
        />
        <SettingCoreTab
          v-else-if="activeTab === 'core'"
          :core="setting.core"
          @update="patchSetting({ core: $event })"
        />
        <SettingCharacterTab
          ref="characterTabRef"
          v-else-if="activeTab === 'characters'"
          :characters="setting.characters"
          @update="patchSetting({ characters: $event })"
          @adjust="emit('adjust-item', { kind: 'character', id: $event })"
        />
        <SettingStorylineTab
          ref="storylineTabRef"
          v-else
          :storylines="setting.storylines"
          @update="patchSetting({ storylines: $event })"
          @adjust="emit('adjust-item', { kind: 'storyline', id: $event })"
        />
      </div>
    </section>

    <aside class="setting-side-stack">
      <section class="design-panel setting-record-panel">
        <div class="setting-side-title">
          <strong>设定操作</strong>
        </div>
        <p class="setting-assistant-hint">
          可以只让 AI 改其中一部分（某个角色、核心体系……）；各字段也支持直接点击修改。
        </p>
        <button class="outline-adjust-entry" type="button" @click="$emit('adjust')">
          <i class="fa-solid fa-wand-magic-sparkles"></i>
          按要求调整设定
        </button>
        <button class="outline-regenerate-btn" type="button" @click="$emit('regenerate')">
          <i class="fa-solid fa-rotate-right"></i>
          重新生成设定
        </button>
      </section>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import SettingWorldTab from './setting/SettingWorldTab.vue'
import SettingCoreTab from './setting/SettingCoreTab.vue'
import SettingCharacterTab from './setting/SettingCharacterTab.vue'
import SettingStorylineTab from './setting/SettingStorylineTab.vue'
import type { WorkflowDraft, WorkflowSettingResult, WorkflowSettingTab } from '../types'

const props = defineProps<{ draft: WorkflowDraft; stale?: boolean }>()
const emit = defineEmits<{
  (event: 'patch', payload: Partial<WorkflowDraft>): void
  (event: 'regenerate'): void
  (event: 'adjust'): void
  (event: 'adjust-item', payload: { kind: 'character' | 'storyline'; id: string }): void
}>()

const activeTab = ref<WorkflowSettingTab>('world')
const setting = computed(() => props.draft.settingResult)
const settingTabs: Array<{ value: WorkflowSettingTab; label: string }> = [
  { value: 'world', label: '世界背景' },
  { value: 'core', label: '核心设定' },
  { value: 'characters', label: '角色卡' },
  { value: 'storyline', label: '故事线' },
]

// 新条目的构造留在各自页签里（它才知道自己的字段形状），这里只负责触发。
const characterTabRef = ref<InstanceType<typeof SettingCharacterTab> | null>(null)
const storylineTabRef = ref<InstanceType<typeof SettingStorylineTab> | null>(null)

const addActionLabel = computed(() => {
  if (activeTab.value === 'characters') return '新增角色'
  if (activeTab.value === 'storyline') return '新增阶段'
  return ''
})

const handleAdd = () => {
  if (activeTab.value === 'characters') characterTabRef.value?.addItem()
  else if (activeTab.value === 'storyline') storylineTabRef.value?.addItem()
}

const patchSetting = (payload: Partial<WorkflowSettingResult>) => {
  emit('patch', { settingResult: { ...props.draft.settingResult, ...payload } })
}
</script>
