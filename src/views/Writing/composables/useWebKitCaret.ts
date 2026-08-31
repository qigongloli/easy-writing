import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import type { Editor } from '@tiptap/vue-3'
import { isTauriRuntime } from '@/storage'

interface WebKitCaretOptions {
  editor: Ref<Editor | undefined>
  rulerStyle: Ref<'none' | 'solid' | 'dashed'>
  fontFamily: Ref<string>
  fontBold: Ref<boolean>
  fontSize: Ref<number>
  fontLineHeight: Ref<number>
  measuredLineHeightPx: Ref<number | null>
  getBaseLineHeightPx: () => number
  normalizePixel: (value: number) => number
}

/**
 * Tauri WebKit（macOS WKWebView）下网格线背景会盖掉原生光标，
 * 这里在编辑器上叠一个自绘光标：跟随选区/字体设置重算位置与高度。
 * 仅 WebKit 且开了网格线时启用；其余运行时完全旁路。
 */
export const useWebKitCaret = (options: WebKitCaretOptions) => {
  const {
    editor,
    rulerStyle,
    fontFamily,
    fontBold,
    fontSize,
    fontLineHeight,
    measuredLineHeightPx,
    getBaseLineHeightPx,
    normalizePixel,
  } = options

  const webkitCaretRuntime = ref(false)
  const webkitCaretVisible = ref(false)
  const webkitCaretStyle = ref<Record<string, string>>({})
  let webkitCaretFrame = 0

  const isTauriWebKitRuntime = () => {
    if (!isTauriRuntime() || typeof navigator === 'undefined') return false
    return (
      /AppleWebKit/i.test(navigator.userAgent) &&
      !/(Chrome|Chromium|Edg|OPR|Firefox)/i.test(navigator.userAgent)
    )
  }

  const webkitCaretEnabled = computed(
    () => webkitCaretRuntime.value && rulerStyle.value !== 'none',
  )

  const hideWebKitCaret = () => {
    webkitCaretVisible.value = false
  }

  const updateWebKitCaret = () => {
    if (!webkitCaretEnabled.value || !editor.value?.isFocused) {
      hideWebKitCaret()
      return
    }

    const { state, view } = editor.value
    if (!state.selection.empty) {
      hideWebKitCaret()
      return
    }

    const wrapper = view.dom.closest('.editor-wrapper') as HTMLElement | null
    if (!wrapper) {
      hideWebKitCaret()
      return
    }

    try {
      const coords = view.coordsAtPos(state.selection.from)
      const wrapperRect = wrapper.getBoundingClientRect()
      const lineHeight = measuredLineHeightPx.value || getBaseLineHeightPx()
      const fontPx = Number(fontSize.value) > 0 ? Number(fontSize.value) : 16
      const caretHeight = normalizePixel(
        Math.min(
          Math.max(fontPx * 1.25, fontPx + 4),
          Math.max(fontPx, lineHeight - 6),
        ),
      )

      webkitCaretStyle.value = {
        left: `${normalizePixel(coords.left - wrapperRect.left)}px`,
        top: `${normalizePixel((coords.top + coords.bottom) / 2 - wrapperRect.top - caretHeight / 2)}px`,
        height: `${caretHeight}px`,
      }
      webkitCaretVisible.value = true
    } catch {
      hideWebKitCaret()
    }
  }

  const scheduleWebKitCaretUpdate = () => {
    if (!webkitCaretEnabled.value) {
      hideWebKitCaret()
      return
    }
    if (webkitCaretFrame) {
      window.cancelAnimationFrame(webkitCaretFrame)
    }
    webkitCaretFrame = window.requestAnimationFrame(() => {
      webkitCaretFrame = 0
      updateWebKitCaret()
    })
  }

  watch(
    [fontFamily, fontBold, fontSize, fontLineHeight, rulerStyle],
    scheduleWebKitCaretUpdate,
    { flush: 'post' },
  )

  onMounted(() => {
    webkitCaretRuntime.value = isTauriWebKitRuntime()
  })

  onBeforeUnmount(() => {
    if (webkitCaretFrame) {
      window.cancelAnimationFrame(webkitCaretFrame)
      webkitCaretFrame = 0
    }
  })

  return {
    webkitCaretEnabled,
    webkitCaretVisible,
    webkitCaretStyle,
    hideWebKitCaret,
    scheduleWebKitCaretUpdate,
  }
}
