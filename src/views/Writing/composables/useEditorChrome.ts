import { ref, type Ref } from 'vue'

/**
 * 编辑器顶栏/底部状态栏的自适应测量：
 * 宽度不够时先切图标模式，用隐藏克隆测完整宽度避免过渡动画干扰。
 * 只做测量与两个模式开关，不持有业务状态。
 */

interface UseEditorChromeOptions {
  toolbarScrollRef: Ref<HTMLElement | null>
  statusBarRef: Ref<HTMLElement | null>
  statusCenterRef: Ref<HTMLElement | null>
  statusRightRef: Ref<HTMLElement | null>
}

const readCssPx = (value: string) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const useEditorChrome = (options: UseEditorChromeOptions) => {
  const { toolbarScrollRef, statusBarRef, statusCenterRef, statusRightRef } = options

  const isToolbarIconOnlyMode = ref(false)
  const isStatusIconOnlyMode = ref(false)
  let toolbarMeasureFrame = 0
  let statusBarMeasureFrame = 0

  const measureToolbarIconMode = () => {
    const toolbar = toolbarScrollRef.value
    const root = toolbar?.closest('.editor-toolbar')
    if (!toolbar || !(root instanceof HTMLElement)) return

    // 用隐藏副本测量完整文字宽度，避免当前图标状态和过渡动画干扰判断。
    const cloneHost = document.createElement('div')
    cloneHost.className = 'writing-editor'
    const cloneRoot = root.cloneNode(true) as HTMLElement
    cloneRoot.classList.remove('toolbar-icon-only-mode')
    cloneHost.style.position = 'fixed'
    cloneHost.style.left = '-10000px'
    cloneHost.style.top = '0'
    cloneHost.style.visibility = 'hidden'
    cloneHost.style.pointerEvents = 'none'
    cloneHost.style.transition = 'none'
    cloneRoot.style.width = 'max-content'
    cloneRoot.style.transition = 'none'
    cloneHost.appendChild(cloneRoot)
    document.body.appendChild(cloneHost)

    const cloneToolbar = cloneRoot.querySelector('.toolbar-scroll') as HTMLElement | null
    if (!cloneToolbar) {
      cloneHost.remove()
      return
    }
    cloneToolbar.style.flex = '0 0 auto'
    cloneToolbar.style.width = 'max-content'
    cloneToolbar.style.overflow = 'visible'
    cloneToolbar.style.transition = 'none'

    const style = window.getComputedStyle(cloneToolbar)
    const items = Array.from(cloneToolbar.children)
    const itemsWidth = items.reduce(
      (total, child) => total + child.getBoundingClientRect().width,
      0
    )
    const gapWidth =
      readCssPx(style.columnGap || style.gap) * Math.max(items.length - 1, 0)
    const requiredWidth = Math.ceil(
      itemsWidth + gapWidth + readCssPx(style.paddingLeft) + readCssPx(style.paddingRight)
    )
    cloneHost.remove()
    isToolbarIconOnlyMode.value = root.clientWidth - requiredWidth < 8
    toolbar.scrollLeft = 0
  }

  const updateToolbarMode = () => {
    if (toolbarMeasureFrame) {
      window.cancelAnimationFrame(toolbarMeasureFrame)
    }
    toolbarMeasureFrame = window.requestAnimationFrame(() => {
      toolbarMeasureFrame = 0
      measureToolbarIconMode()
    })
  }

  const measureStatusBarMode = () => {
    const bar = statusBarRef.value
    const center = statusCenterRef.value
    const right = statusRightRef.value
    if (!bar || !center || !right) return

    // 用完整文本状态测量所需宽度，避免图标模式下低估内容宽度。
    const restoreIconOnlyClass = bar.classList.contains('status-icon-only-mode')
    bar.classList.remove('status-icon-only-mode')
    const style = window.getComputedStyle(bar)
    const rightStyle = window.getComputedStyle(right)
    const rightItems = Array.from(right.children)
    const rightItemsWidth = rightItems.reduce(
      (total, child) => total + child.getBoundingClientRect().width,
      0
    )
    const rightGap =
      readCssPx(rightStyle.columnGap || rightStyle.gap) * Math.max(rightItems.length - 1, 0)
    const requiredWidth = Math.ceil(
      center.scrollWidth +
        rightItemsWidth +
        rightGap +
        readCssPx(style.columnGap || style.gap) +
        readCssPx(style.paddingLeft) +
        readCssPx(style.paddingRight)
    )
    if (restoreIconOnlyClass) {
      bar.classList.add('status-icon-only-mode')
    }
    isStatusIconOnlyMode.value = requiredWidth > bar.clientWidth
  }

  const updateStatusBarMode = () => {
    if (statusBarMeasureFrame) {
      window.cancelAnimationFrame(statusBarMeasureFrame)
    }
    statusBarMeasureFrame = window.requestAnimationFrame(() => {
      statusBarMeasureFrame = 0
      measureStatusBarMode()
    })
  }

  const disposeChromeMeasure = () => {
    if (toolbarMeasureFrame) {
      window.cancelAnimationFrame(toolbarMeasureFrame)
      toolbarMeasureFrame = 0
    }
    if (statusBarMeasureFrame) {
      window.cancelAnimationFrame(statusBarMeasureFrame)
      statusBarMeasureFrame = 0
    }
  }

  return {
    isToolbarIconOnlyMode,
    isStatusIconOnlyMode,
    updateToolbarMode,
    updateStatusBarMode,
    disposeChromeMeasure
  }
}
