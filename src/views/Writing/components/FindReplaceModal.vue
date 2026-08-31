<template>
  <EwModal
    v-model:visible="visible"
    title="查找替换"
    width="360px"
    :modal="false"
    :close-on-click-modal="false"
    :draggable="true"
    custom-class="find-replace-dialog"
    :initial-position="props.initialPosition"
    :header-style="headerStyle"
    :body-style="bodyStyle"
    @close="onClose"
  >
    <div class="find-replace-body">
      <div class="input-group">
        <el-input
          v-model="query"
          class="ink-select find-replace-input"
          placeholder="输入查找内容"
          @keydown.enter.prevent="nextMatch"
        >
          <template #suffix>
            <span class="match-count">{{ stateText }}</span>
          </template>
        </el-input>
        <div class="nav-buttons">
          <button
            class="ink-btn ink-btn-ghost ink-btn-sm icon-btn"
            type="button"
            title="上一个"
            @click="prevMatch"
          >
            <i class="fa-solid fa-chevron-up"></i>
          </button>
          <button
            class="ink-btn ink-btn-ghost ink-btn-sm icon-btn"
            type="button"
            title="下一个"
            @click="nextMatch"
          >
            <i class="fa-solid fa-chevron-down"></i>
          </button>
        </div>
      </div>

      <div class="input-group">
        <el-input
          v-model="replace"
          class="ink-select find-replace-input"
          placeholder="输入替换内容，留空可删除"
          :disabled="readOnly"
          @keydown.enter.prevent="replaceCurrent"
        />
        <button
          class="ink-btn ink-btn-primary ink-btn-sm"
          type="button"
          :disabled="readOnly || state.count === 0"
          @click="replaceCurrent"
        >
          替换
        </button>
      </div>

      <div v-if="readOnly" class="readonly-tip" role="status">
        正文生成期间仅可查找，暂停生成后才能替换。
      </div>
      <div class="modal-footer-actions">
        <button
          class="ink-btn ink-btn-outline ink-btn-sm"
          type="button"
          :disabled="readOnly || state.count === 0"
          @click="replaceAllInDoc"
        >
          全部替换
        </button>
      </div>
    </div>
  </EwModal>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import type { Editor } from '@tiptap/core'
import { findReplacePluginKey } from '../extends/FindReplaceExtension'
import EwModal from '@/components/EwModal/index.vue'

const props = defineProps<{
  modelValue: boolean
  editor: Editor | null | undefined
  initialPosition?: { x: number; y: number }
  readOnly?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
}>()

const visible = ref(false)
const query = ref('')
const replace = ref('')

// 自定义样式：减小 header 和 body 的 padding
const headerStyle = {
  padding: '10px 10px'
}

const bodyStyle = {
  padding: '5px 10px 10px 10px'
}

// 弹窗开启时恢复编辑器内已有的查找替换条件。
watch(() => props.modelValue, (val) => {
  visible.value = val
  if (val) {
    if (props.editor) {
      const s = findReplacePluginKey.getState(props.editor.state)
      if (s) {
        query.value = s.query || ''
        replace.value = s.replace || ''
      }
    }
  }
}, { immediate: true })

watch(visible, (val) => {
  emit('update:modelValue', val)
})

// 编辑器事务变化后刷新匹配数量和当前位置。
let updateHandler: (() => void) | null = null
let observedEditor: Editor | null | undefined = null
const updateTrigger = ref(0)

watch(
  () => props.editor,
  (nextEditor) => {
    if (observedEditor && updateHandler) {
      observedEditor.off('transaction', updateHandler)
    }
    observedEditor = nextEditor
    updateHandler = null
    if (!nextEditor) return

    updateHandler = () => {
      updateTrigger.value++
    }
    nextEditor.on('transaction', updateHandler)
    updateTrigger.value++
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (observedEditor && updateHandler) {
    observedEditor.off('transaction', updateHandler)
  }
  observedEditor = null
  updateHandler = null
})

const state = computed(() => {
  // 事务计数只用于通知 Vue 重新读取 ProseMirror 插件状态。
  updateTrigger.value
  if (!props.editor) return { count: 0, index: 0 }
  const s = findReplacePluginKey.getState(props.editor.state)
  return {
    count: s?.matches.length || 0,
    index: (s?.index || 0) + (s?.matches.length ? 1 : 0)
  }
})

const stateText = computed(() => {
  return state.value.count ? `${state.value.index}/${state.value.count}` : '0/0'
})

watch(query, (val) => {
  if (props.editor) {
    props.editor.commands.setFindQuery(val)
  }
})

watch(replace, (val) => {
  if (props.editor) {
    props.editor.commands.setReplaceText(val)
  }
})

const nextMatch = () => props.editor?.commands.nextMatch()
const prevMatch = () => props.editor?.commands.prevMatch()
const replaceCurrent = () => {
  if (props.readOnly) return
  props.editor?.commands.replaceCurrent()
}

const replaceAllInDoc = () => {
  if (props.readOnly) return
  props.editor?.commands.replaceAllInDoc()
}

const onClose = () => {
  // 关闭弹窗时清除正文中的查找高亮。
  if (props.editor) {
    props.editor.commands.setFindQuery('')
  }
}
</script>

<style scoped lang="scss">
.find-replace-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.input-group {
  display: flex;
  gap: 8px;
  align-items: center;

  .find-replace-input {
    flex: 1;
    min-width: 0;
  }

  .match-count {
    font-size: 12px;
    color: var(--ink-sec);
    pointer-events: none;
  }
}

.nav-buttons {
  display: flex;
  gap: 2px;
  background: var(--btn-outline-bg);
  border: 1px solid var(--btn-outline-border);
  border-radius: 4px;
  padding: 2px;

  .icon-btn {
    min-width: 28px;
    padding: 4px 8px;

    i {
      margin: 0;
    }
  }
}

.readonly-tip {
  color: var(--ink-sec);
  font-size: 13px;
  line-height: 1.5;
}

.modal-footer-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-top: 4px;
}
</style>
