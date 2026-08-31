<template>
  <section class="workflow-book-shell">
    <nav class="workflow-book-steps" aria-label="工作流步骤">
      <template v-for="(step, index) in majorSteps" :key="step.code">
        <button
          class="workflow-book-step"
          :class="{ active: step.code === currentStep, done: index < currentIndex }"
          type="button"
          @click="$emit('step-click', step.code)"
        >
          <span class="workflow-book-step__index">{{ index + 1 }}</span>
          <span class="workflow-book-step__copy">
            <strong>{{ step.title }}</strong>
            <small>{{ step.desc }}</small>
          </span>
        </button>
        <span v-if="index < majorSteps.length - 1" class="workflow-book-step-line" aria-hidden="true"></span>
      </template>
    </nav>

    <main class="workflow-book-main">
      <slot />
    </main>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { WorkflowStepCode } from '../types'

const props = defineProps<{
  currentStep: WorkflowStepCode
}>()

defineEmits<{
  (event: 'step-click', stepCode: WorkflowStepCode): void
}>()

// 顶部四个步骤与服务端建书主链路保持一一对应。
const majorSteps = [
  { code: 'MODE_SELECT' as WorkflowStepCode, title: '创作方向与灵感', desc: '先定方向，再找灵感' },
  { code: 'BASE_CONFIG' as WorkflowStepCode, title: '写作参数', desc: '补全篇幅与写法' },
  { code: 'OUTLINE_GENERATE' as WorkflowStepCode, title: '生成大纲', desc: 'AI 快速生成大纲' },
  { code: 'SETTING_GENERATE' as WorkflowStepCode, title: '生成设定', desc: '生成世界观与设定' },
]

const currentIndex = computed(() => {
  const index = majorSteps.findIndex(item => item.code === props.currentStep)
  return Math.max(0, index)
})
</script>
