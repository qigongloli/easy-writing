<template>
  <span
    ref="rootEl"
    class="workflow-inline-edit"
    :class="{
      'is-editing': editing,
      'is-block': block,
      'is-multiline': multiline,
      'is-compact': compact,
    }"
  >
    <template v-if="editing">
      <textarea
        v-if="multiline"
        ref="editorEl"
        :value="draftValue"
        class="workflow-inline-edit__editor"
        :style="editorStyle"
        :rows="rows"
        :placeholder="placeholder"
        @input="updateDraft(($event.target as HTMLTextAreaElement).value)"
        @keydown.esc.prevent="cancel"
      ></textarea>
      <!-- 单行语义也用可换行 textarea，保持与展示态相同的折行排版；Enter 保存、换行符剔除 -->
      <textarea
        v-else
        ref="editorEl"
        :value="draftValue"
        class="workflow-inline-edit__editor workflow-inline-edit__editor--singleline"
        :style="editorStyle"
        rows="1"
        :placeholder="placeholder"
        @input="updateSinglelineDraft($event)"
        @keydown.enter="handleSinglelineEnter"
        @keydown.esc.prevent="cancel"
      ></textarea>
    </template>
    <button
      v-else
      ref="displayEl"
      class="workflow-inline-edit__display"
      type="button"
      :disabled="disabled"
      @click.stop="beginEdit"
      v-text="displayValue"
    ></button>
  </span>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  multiline?: boolean
  rows?: number
  block?: boolean
  compact?: boolean
  disabled?: boolean
}>(), {
  placeholder: '点击输入',
  multiline: false,
  rows: 3,
  block: false,
  compact: false,
  disabled: false,
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'edit-start'): void
}>()

const rootEl = ref<HTMLElement | null>(null)
const displayEl = ref<HTMLElement | null>(null)
const editorEl = ref<HTMLInputElement | HTMLTextAreaElement | null>(null)
const editing = ref(false)
const draftValue = ref(props.modelValue)
const initialValue = ref(props.modelValue)
const measuredHeight = ref(0)
const normalizedModelValue = computed(() => props.modelValue.trim())
const displayValue = computed(() => normalizedModelValue.value || props.placeholder)
const editorStyle = computed(() => {
  if (!measuredHeight.value) return undefined
  const height = `${measuredHeight.value}px`
  return { height, minHeight: height }
})

watch(() => props.modelValue, value => {
  if (!editing.value) draftValue.value = value.trim()
})

const focusEditor = async () => {
  await nextTick()
  const editor = editorEl.value
  if (!editor) return
  editor.focus()
  const cursorIndex = editor.value.length
  editor.setSelectionRange(cursorIndex, cursorIndex)
}

const beginEdit = () => {
  if (props.disabled) return
  measuredHeight.value = Math.ceil(displayEl.value?.getBoundingClientRect().height || 0)
  draftValue.value = normalizedModelValue.value
  initialValue.value = normalizedModelValue.value
  editing.value = true
  emit('edit-start')
  void focusEditor()
}

// 输入过程只更新本地草稿，不向上 emit：
// 1) 父级每次 patch 都要重建整份大纲（数百章），逐字符提交在中文输入时会明显掉帧；
// 2) 大纲占位章一旦收到 patch 就被标记为「用户已编辑」，逐字符提交会让"点开看一眼"
//    也变成永久转正。统一改为失焦或回车时提交，且值未变不提交。
const updateDraft = (value: string) => {
  draftValue.value = value
}

// 单行编辑器随内容折行自动调高，保持与展示态一致的排版
const resizeSinglelineEditor = async () => {
  await nextTick()
  const editor = editorEl.value
  if (!editor) return
  const borderDelta = editor.offsetHeight - editor.clientHeight
  editor.style.height = '0px'
  measuredHeight.value = Math.ceil(editor.scrollHeight + borderDelta)
  editor.style.height = `${measuredHeight.value}px`
}

const updateSinglelineDraft = (event: Event) => {
  const editor = event.target as HTMLTextAreaElement
  const stripped = editor.value.replace(/[\r\n]+/g, '')
  if (stripped !== editor.value) editor.value = stripped
  updateDraft(stripped)
  void resizeSinglelineEditor()
}

const handleSinglelineEnter = (event: KeyboardEvent) => {
  if (event.isComposing) return
  event.preventDefault()
  save()
}

const save = () => {
  const nextValue = draftValue.value.trim()
  editing.value = false
  // 值没变就不提交：避免"点开又点走"被上层当成一次真实编辑。
  if (nextValue === initialValue.value) {
    draftValue.value = initialValue.value
    return
  }
  emit('update:modelValue', nextValue)
}

const cancel = () => {
  // 编辑期间没有向上提交过，取消只需还原本地草稿。
  draftValue.value = initialValue.value
  editing.value = false
}

// 点击组件外部退出编辑，内容已在输入时同步。
const handleOutsidePointerDown = (event: PointerEvent) => {
  if (!editing.value) return
  const target = event.target
  if (target instanceof Node && rootEl.value?.contains(target)) return
  save()
}

onMounted(() => {
  document.addEventListener('pointerdown', handleOutsidePointerDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutsidePointerDown)
})
</script>
