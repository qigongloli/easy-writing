<template>
  <div class="setting-storyline-wrap">
    <p class="setting-storyline-intro">
      梳理故事六大阶段的推进逻辑，明确主线发展脉络与关键事件，确保叙事节奏与情节张力。
    </p>

    <div ref="scrollRef" class="setting-storyline-scroll" :style="storylineCountStyle">
      <div class="setting-storyline-track">
        <article v-for="(node, index) in storylines" :key="node.id" class="setting-storyline-card">
          <span class="setting-storyline-index">{{ index + 1 }}</span>
          <span class="setting-storyline-actions">
            <button
              type="button"
              :aria-label="`让 AI 调整${node.title}`"
              title="让 AI 调整这一条"
              @click="$emit('adjust', node.id)"
            >
              <i class="fa-solid fa-wand-magic-sparkles"></i>
            </button>
            <button
              type="button"
              :aria-label="`删除${node.title}`"
              title="删除这一阶段"
              @click="removeNode(node.id)"
            >
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </span>
          <WorkflowInlineEdit
            class="setting-storyline-title"
            compact
            :model-value="node.title"
            @update:model-value="updateNode(node.id, { title: $event })"
          />
          <span class="setting-storyline-icon" aria-hidden="true"><i :class="node.icon"></i></span>
          <WorkflowInlineEdit
            class="setting-storyline-desc"
            block
            multiline
            :rows="3"
            :model-value="node.desc"
            @update:model-value="updateNode(node.id, { desc: $event })"
          />
          <span class="setting-storyline-event-label">关键事件</span>
          <WorkflowInlineEdit
            class="setting-storyline-event"
            block
            multiline
            :rows="2"
            :model-value="node.keyEvent"
            @update:model-value="updateNode(node.id, { keyEvent: $event })"
          />
        </article>
      </div>

      <div class="setting-storyline-timeline" aria-hidden="true">
        <span v-for="node in storylines" :key="node.id" class="setting-storyline-dot"></span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import WorkflowInlineEdit from '../WorkflowInlineEdit.vue'
import { createNewSettingStoryline } from '../../workflow-adapter'
import type { WorkflowSettingStoryline } from '../../types'

const props = defineProps<{ storylines: WorkflowSettingStoryline[] }>()
const emit = defineEmits<{
  (event: 'update', storylines: WorkflowSettingStoryline[]): void
  (event: 'adjust', id: string): void
}>()
// 故事线阶段数量会随生成结果变化，列数交给 CSS Grid 按实际数据计算。
const storylineCountStyle = computed(() => ({ '--storyline-count': String(Math.max(props.storylines.length, 1)) }))

const updateNode = (id: string, payload: Partial<WorkflowSettingStoryline>) => {
  emit('update', props.storylines.map(item => (item.id === id ? { ...item, ...payload } : item)))
}

const removeNode = (id: string) => {
  emit('update', props.storylines.filter(item => item.id !== id))
}

const scrollRef = ref<HTMLElement | null>(null)
// 新卡片追加在最右侧，而列表是横向滚动的——不主动滚过去，用户看到的还是原来那几张，
// 会以为没加上。数据由父级回流，所以等 props 真正变长了再滚，而不是 emit 之后就滚。
let pendingScrollToEnd = false

watch(
  () => props.storylines.length,
  async (next, prev) => {
    if (!pendingScrollToEnd || next <= prev) return
    pendingScrollToEnd = false
    await nextTick()
    const el = scrollRef.value
    if (!el) return
    el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' })
  }
)

const addNode = () => {
  pendingScrollToEnd = true
  emit('update', [...props.storylines, createNewSettingStoryline()])
}

// 新增入口移到了页签行（吸顶常驻），这里只对外提供动作
defineExpose({ addItem: addNode })
</script>
