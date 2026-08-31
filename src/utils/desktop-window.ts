import { isTauriRuntime } from '@/storage'
import type { WindowOptions } from '@tauri-apps/api/window'

export type DesktopPlatform = 'windows' | 'macos' | 'other'

export const getDesktopPlatform = (): DesktopPlatform => {
  if (typeof navigator === 'undefined') return 'other'
  const value = `${navigator.userAgent} ${navigator.platform}`
  if (/Windows/i.test(value)) return 'windows'
  if (/Macintosh|Mac OS X|MacIntel|MacPPC|Mac68K/i.test(value)) return 'macos'
  return 'other'
}

export const getAppWindowChromeOptions = (): Partial<WindowOptions> => {
  if (!isTauriRuntime()) return {}
  // 桌面窗口外壳按系统拆分，避免 Windows 原生标题栏和 macOS 红绿灯互相影响。
  if (getDesktopPlatform() === 'windows') {
    return {
      decorations: false,
      shadow: true,
    }
  }
  if (getDesktopPlatform() === 'macos') {
    return {
      decorations: true,
      titleBarStyle: 'overlay',
      hiddenTitle: true,
      trafficLightPosition: { x: 16, y: 24 } as WindowOptions['trafficLightPosition'],
    }
  }
  return {}
}
