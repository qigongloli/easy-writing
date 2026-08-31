import { isTauriRuntime } from '@/storage'
import { ElMessage } from 'element-plus'
import { inkConfirm } from '@/utils/ink-confirm'
import type { DownloadEvent } from '@tauri-apps/plugin-updater'

const DESKTOP_UPDATE_NOTES_KEY = 'ew-desktop-update-notes'

export type DesktopUpdatePhase = 'checking' | 'downloading' | 'installing' | 'installed' | 'error'

export interface DesktopUpdateInfo {
  currentVersion: string
  version: string
  date?: string
  body?: string
}

export interface DesktopUpdateProgress {
  downloaded: number
  total?: number
  percent?: number
}

export interface DesktopUpdateSnapshot {
  phase: DesktopUpdatePhase
  info?: DesktopUpdateInfo
  progress?: DesktopUpdateProgress
  message: string
  error?: string
}

export interface DesktopUpdateResult {
  enabled: boolean
  updated: boolean
  message: string
}

export interface DesktopUpdateOptions {
  silent?: boolean
  onStateChange?: (state: DesktopUpdateSnapshot) => void
}

interface StoredDesktopUpdateNotes extends DesktopUpdateInfo {
  shown: boolean
  installedAt: string
}

// 避免启动自动检查和手动检查同时触发重复下载。
let activeUpdatePromise: Promise<DesktopUpdateResult> | null = null

const readUpdateString = (value: unknown) => typeof value === 'string' ? value : undefined

const toUpdateInfo = (update: { currentVersion: string; version: string; date?: string; body?: string; rawJson?: Record<string, unknown> }): DesktopUpdateInfo => ({
  currentVersion: update.currentVersion,
  version: update.version,
  // 兼容 Tauri manifest 原始字段，确保发布备注和发布日期可展示。
  date: update.date ?? readUpdateString(update.rawJson?.pub_date),
  body: update.body ?? readUpdateString(update.rawJson?.notes),
})

const savePendingUpdateNotes = (info: DesktopUpdateInfo) => {
  // 先缓存目标版本说明，安装重启后再按当前版本匹配展示。
  window.localStorage.setItem(
    DESKTOP_UPDATE_NOTES_KEY,
    JSON.stringify({ ...info, shown: false, installedAt: new Date().toISOString() } satisfies StoredDesktopUpdateNotes)
  )
}

const readPendingUpdateNotes = () => {
  try {
    const raw = window.localStorage.getItem(DESKTOP_UPDATE_NOTES_KEY)
    return raw ? JSON.parse(raw) as StoredDesktopUpdateNotes : null
  } catch {
    window.localStorage.removeItem(DESKTOP_UPDATE_NOTES_KEY)
    return null
  }
}

const updateDownloadProgress = (
  event: DownloadEvent,
  info: DesktopUpdateInfo,
  progress: DesktopUpdateProgress,
  onStateChange?: DesktopUpdateOptions['onStateChange']
) => {
  if (event.event === 'Started') {
    progress.downloaded = 0
    progress.total = event.data.contentLength
    progress.percent = event.data.contentLength ? 0 : undefined
  } else if (event.event === 'Progress') {
    progress.downloaded += event.data.chunkLength
    progress.percent = progress.total ? Math.min(99, Math.floor((progress.downloaded / progress.total) * 100)) : undefined
  } else {
    progress.percent = 100
    if (progress.total) progress.downloaded = progress.total
  }

  onStateChange?.({
    phase: event.event === 'Finished' ? 'installing' : 'downloading',
    info,
    progress: { ...progress },
    message: event.event === 'Finished' ? '下载完成，正在安装更新...' : '正在下载更新包...',
  })
}

export const consumePendingDesktopUpdateNotes = async (): Promise<DesktopUpdateInfo | null> => {
  if (!isTauriRuntime()) return null

  const notes = readPendingUpdateNotes()
  if (!notes || notes.shown) return null

  try {
    const { getVersion } = await import('@tauri-apps/api/app')
    const currentVersion = await getVersion()
    // 只有应用实际启动到目标版本后，才展示该版本的更新说明。
    if (currentVersion !== notes.version) return null

    window.localStorage.setItem(
      DESKTOP_UPDATE_NOTES_KEY,
      JSON.stringify({ ...notes, shown: true } satisfies StoredDesktopUpdateNotes)
    )
    return {
      currentVersion: notes.currentVersion,
      version: notes.version,
      date: notes.date,
      body: notes.body,
    }
  } catch {
    return null
  }
}

export const checkDesktopUpdate = async (options: DesktopUpdateOptions = {}): Promise<DesktopUpdateResult> => {
  if (!isTauriRuntime()) {
    return {
      enabled: false,
      updated: false,
      message: '更新功能仅桌面端支持',
    }
  }

  if (activeUpdatePromise) return activeUpdatePromise

  activeUpdatePromise = (async () => {
    let detectedUpdateInfo: DesktopUpdateInfo | undefined

    options.onStateChange?.({
      phase: 'checking',
      message: '正在检查新版本...',
    })

    try {
      const { check } = await import('@tauri-apps/plugin-updater')
      const update = await check()
      if (!update) {
        if (!options.silent) ElMessage.info('当前已是最新版本')
        return {
          enabled: true,
          updated: false,
          message: '当前已是最新版本',
        }
      }

      const info = toUpdateInfo(update)
      detectedUpdateInfo = info
      const progress: DesktopUpdateProgress = { downloaded: 0 }

      // 静默检查（如启动自动检查）发现新版本时，不直接下载安装打断写作，
      // 而是弹确认让用户自行选择更新时机；用户选"稍后"则本次跳过。
      if (options.silent) {
        const confirmed = await inkConfirm(
          `发现新版本 ${info.version}，是否现在更新？更新将在下载完成、重启应用后生效。`,
          '版本更新',
          {
            confirmButtonText: '立即更新',
            cancelButtonText: '稍后再说',
            type: 'info',
          }
        )
          .then(() => true)
          .catch(() => false)
        if (!confirmed) {
          return {
            enabled: true,
            updated: false,
            message: '已跳过本次更新',
          }
        }
      }

      savePendingUpdateNotes(info)
      options.onStateChange?.({
        phase: 'downloading',
        info,
        progress,
        message: '发现新版本，正在下载更新包...',
      })

      await update.downloadAndInstall((event) => {
        updateDownloadProgress(event, info, progress, options.onStateChange)
      })

      options.onStateChange?.({
        phase: 'installed',
        info,
        progress: { ...progress, percent: 100 },
        message: '更新已安装，请重启应用后继续使用。',
      })

      return {
        enabled: true,
        updated: true,
        message: `已安装新版本 ${update.version}，重启后生效`,
      }
    } catch (error) {
      const message = (error as { message?: string } | null)?.message || '检查更新失败'
      options.onStateChange?.({
        phase: 'error',
        info: detectedUpdateInfo,
        message,
        error: message,
      })
      if (!options.silent) ElMessage.error(message)
      return {
        enabled: true,
        updated: false,
        message,
      }
    } finally {
      activeUpdatePromise = null
    }
  })()

  return activeUpdatePromise
}
