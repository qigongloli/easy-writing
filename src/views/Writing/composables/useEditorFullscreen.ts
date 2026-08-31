import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'

/** 带浏览器前缀的全屏 API（WebKit / 旧 Firefox / IE） */
interface PrefixedFullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null
  mozFullScreenElement?: Element | null
  msFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
  mozCancelFullScreen?: () => Promise<void> | void
  msExitFullscreen?: () => Promise<void> | void
}
interface PrefixedFullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void
  mozRequestFullScreen?: () => Promise<void> | void
  msRequestFullscreen?: () => Promise<void> | void
}

const getFullscreenElement = () => {
  const doc = document as PrefixedFullscreenDocument
  return (
    doc.fullscreenElement ||
    doc.webkitFullscreenElement ||
    doc.mozFullScreenElement ||
    doc.msFullscreenElement ||
    null
  )
}

const requestFullscreen = async (element: HTMLElement) => {
  const target = element as PrefixedFullscreenElement
  if (typeof target.requestFullscreen === 'function')
    return target.requestFullscreen()
  if (typeof target.webkitRequestFullscreen === 'function')
    return target.webkitRequestFullscreen()
  if (typeof target.mozRequestFullScreen === 'function')
    return target.mozRequestFullScreen()
  if (typeof target.msRequestFullscreen === 'function')
    return target.msRequestFullscreen()
  throw new Error('Fullscreen API is not supported')
}

const exitFullscreen = async () => {
  const doc = document as PrefixedFullscreenDocument
  if (typeof document.exitFullscreen === 'function')
    return document.exitFullscreen()
  if (typeof doc.webkitExitFullscreen === 'function')
    return doc.webkitExitFullscreen()
  if (typeof doc.mozCancelFullScreen === 'function')
    return doc.mozCancelFullScreen()
  if (typeof doc.msExitFullscreen === 'function') return doc.msExitFullscreen()
  throw new Error('Fullscreen API is not supported')
}

/**
 * 编辑器整页全屏：状态跟随浏览器事件（含 WebKit 前缀事件），
 * 组件卸载时若仍处于全屏则自动退出。生命周期钩子在组合式内部登记。
 */
export const useEditorFullscreen = () => {
  const isFullscreen = ref(false)

  const syncFullscreenState = () => {
    isFullscreen.value = Boolean(getFullscreenElement())
  }

  const toggleFullscreen = async () => {
    try {
      const current = getFullscreenElement()
      if (current) {
        await exitFullscreen()
        return
      }
      // 这里使用“整个页面”全屏（documentElement），而不是仅让编辑器容器全屏。
      // 否则会丢失挂在 html 上的主题样式（theme-xxx / --bg-main），导致全屏背景变黑。
      await requestFullscreen(document.documentElement)
    } catch (error) {
      console.warn('toggle fullscreen failed', error)
      ElMessage.warning('当前浏览器不支持全屏')
    } finally {
      syncFullscreenState()
    }
  }

  onMounted(() => {
    syncFullscreenState()
    document.addEventListener('fullscreenchange', syncFullscreenState)
    document.addEventListener('webkitfullscreenchange', syncFullscreenState)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('fullscreenchange', syncFullscreenState)
    document.removeEventListener('webkitfullscreenchange', syncFullscreenState)
    if (getFullscreenElement()) {
      void exitFullscreen()
    }
  })

  return { isFullscreen, toggleFullscreen }
}
