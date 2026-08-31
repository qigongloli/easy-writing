import { nextTick, ref, type ComputedRef, type Ref } from 'vue'
import type { Editor } from '@tiptap/vue-3'
import type { Transaction } from 'prosemirror-state'

interface BubbleMenuOptions {
  editor: Ref<Editor | undefined>
  bubbleMenuAllowed: ComputedRef<boolean>
  isReviewing: Ref<boolean>
}

/**
 * 划词气泡菜单（AI 润色/绑定/更多）的显隐与定位：
 * 贴选区上方、放不下翻下方，挂 body 后按视口收口；
 * 查找跳转（scrolledToMatch 事务）与 Review 期间抑制弹出。
 */
export const useBubbleMenu = (options: BubbleMenuOptions) => {
  const { editor, bubbleMenuAllowed, isReviewing } = options

  const isBubbleMenuVisible = ref(false)
  const isBubbleMenuAnimating = ref(false)
  const bubbleMenuStyle = ref<Record<string, string>>({
    top: '0px',
    left: '0px',
  })
  const bubbleMenuRef = ref<HTMLElement | null>(null)

  const updateBubbleMenuPosition = ({ transaction }: { transaction?: Transaction | null } = {}) => {
    if (!editor.value || !bubbleMenuAllowed.value) {
      isBubbleMenuVisible.value = false
      return
    }
    const { from, to, empty } = editor.value.state.selection

    // 如果选区为空或正在 Review，则隐藏
    // 如果是查找跳转导致的选区变化(scrolledToMatch)，也不显示气泡菜单
    if (empty || isReviewing.value || transaction?.getMeta('scrolledToMatch')) {
      isBubbleMenuVisible.value = false
      return
    }

    const view = editor.value.view
    const start = view.coordsAtPos(from)
    const end = view.coordsAtPos(to)

    const editorWrapper = document.querySelector('.editor-wrapper')
    if (!editorWrapper) return
    const editorRect = editorWrapper.getBoundingClientRect()

    const centerX = (start.left + end.right) / 2
    const MENU_HEIGHT = 48
    const GAP = 10

    let targetTop = start.top - GAP - MENU_HEIGHT
    const relativeTop = start.top - editorRect.top

    if (relativeTop < MENU_HEIGHT + GAP) {
      targetTop = end.bottom + GAP
    }

    isBubbleMenuAnimating.value = false
    bubbleMenuStyle.value = {
      left: `${centerX}px`,
      top: `${targetTop}px`,
      transformOrigin:
        relativeTop < MENU_HEIGHT + GAP ? 'center top' : 'center bottom',
    }

    isBubbleMenuVisible.value = true

    nextTick(() => {
      if (!bubbleMenuRef.value) return

      const menuWidth = bubbleMenuRef.value.offsetWidth
      const halfWidth = menuWidth / 2
      const visibleLeft = 12
      const visibleRight = window.innerWidth - 12
      const nextStyle: Record<string, string> = {
        ...bubbleMenuStyle.value,
        '--bubble-visible-width': `${Math.max(0, visibleRight - visibleLeft)}px`,
      }

      // 菜单挂到 body 后按视口收口，避免被编辑器和侧栏裁剪。
      let newCenterX = centerX
      const minCenterX = visibleLeft + halfWidth + 12
      const maxCenterX = visibleRight - halfWidth - 12

      if (minCenterX <= maxCenterX) {
        newCenterX = Math.min(Math.max(newCenterX, minCenterX), maxCenterX)
      } else {
        newCenterX = (visibleLeft + visibleRight) / 2
      }
      if (Math.abs(newCenterX - centerX) > 1) {
        nextStyle.left = `${newCenterX}px`
      }
      bubbleMenuStyle.value = nextStyle

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          isBubbleMenuAnimating.value = true
        })
      })
    })
  }

  const hideBubbleMenu = () => {
    isBubbleMenuVisible.value = false
    isBubbleMenuAnimating.value = false
  }

  return {
    isBubbleMenuVisible,
    isBubbleMenuAnimating,
    bubbleMenuStyle,
    bubbleMenuRef,
    updateBubbleMenuPosition,
    hideBubbleMenu,
  }
}
