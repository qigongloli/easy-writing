<template>
  <div class="workflow-step-error" role="alert">
    <div class="workflow-step-error__icon">
      <i class="fa-solid fa-circle-exclamation"></i>
    </div>
    <div class="workflow-step-error__body">
      <div class="workflow-step-error__head">
        <strong>{{ notice.title }}</strong>
        <button type="button" aria-label="关闭错误提示" @click="$emit('dismiss')">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <p>{{ notice.message }}</p>
      <dl>
        <div><dt>使用模型</dt><dd>{{ notice.modelName }}</dd></div>
        <div><dt>错误编号</dt><dd class="workflow-step-error__reference">{{ notice.errorReference }}</dd></div>
      </dl>
      <button class="workflow-step-error__retry" type="button" :disabled="generating" @click="$emit('retry')">
        <i class="fa-solid fa-rotate-right"></i>
        重新生成
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  notice: {
    title: string
    modelName: string
    message: string
    errorCode: string
    errorReference: string
  }
  generating?: boolean
}>()

defineEmits<{
  (event: 'dismiss'): void
  (event: 'retry'): void
}>()
</script>
