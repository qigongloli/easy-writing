import { ElMessage } from 'element-plus'
import { isTauriRuntime } from '@/storage'

export interface OpenLinkOptions {
  title?: string
}

// 拦截 URL 里的控制字符是本意，正则里的控制符区间不是笔误
// eslint-disable-next-line no-control-regex
const hasControlCharacter = (value: string) => /[\u0000-\u001f\u007f]/.test(value)

const normalizeHttpUrl = (value?: string | null) => {
  const url = String(value || '').trim()
  if (!url || hasControlCharacter(url)) return ''

  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : ''
  } catch {
    return ''
  }
}

export const openLink = async (value?: string | null, options: OpenLinkOptions = {}) => {
  const url = normalizeHttpUrl(value)
  if (!url) {
    ElMessage.warning('链接地址无效')
    return false
  }

  // 桌面端使用应用内 WebView，Web 端继续使用浏览器原生标签页。
  if (isTauriRuntime()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('open_in_app_browser', {
        url,
        title: options.title || '网页查看'
      })
      return true
    } catch (error) {
      console.error('open in-app browser failed', error)
      ElMessage.error('打开窗口失败')
      return false
    }
  }

  const opened = window.open(url, '_blank')
  if (opened) {
    opened.opener = null
  } else {
    ElMessage.error('打开窗口失败')
  }
  return Boolean(opened)
}
