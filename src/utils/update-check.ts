import { GITHUB_LATEST_RELEASE_API_URL, GITHUB_RELEASES_URL } from '@/config/opensource'
import { isTauriRuntime } from '@/storage'

/**
 * 轻量更新提醒：启动后查一次 GitHub 最新 Release，比当前版本新就弹通知，
 * 点击去下载页。不下载、不安装、不签名——与被禁用的 tauri 自动更新器无关。
 *
 * - 只在桌面端跑（走 tauri-plugin-http，不受 WebView CSP 限制）
 * - 一天最多请求一次；用户关掉某个版本的通知后同版本不再提醒
 * - 任何失败（断网、GitHub 限流、字段变化）都静默，绝不打扰写作
 */

const STATE_KEY = 'ew-update-check'
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

export interface NewReleaseInfo {
  /** 版本标签原文，如 v1.1.0 */
  tag: string
  /** Release 标题（GitHub 上填的名字，可能为空） */
  name: string
  /** 下载页地址 */
  url: string
}

interface UpdateCheckState {
  lastCheckedAt: number
  dismissedTag: string
}

const loadState = (): UpdateCheckState => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STATE_KEY) || '{}')
    return {
      lastCheckedAt: Number(parsed?.lastCheckedAt) || 0,
      dismissedTag: String(parsed?.dismissedTag || ''),
    }
  } catch {
    return { lastCheckedAt: 0, dismissedTag: '' }
  }
}

const saveState = (state: UpdateCheckState) => {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state))
  } catch {
    // 存不进就存不进，下次多查一次而已
  }
}

/** 版本号比较：支持 v 前缀与不等长段（v1.2 vs 1.2.0.1）。a>b 返回 1，相等 0，a<b 返回 -1 */
export const compareVersions = (a: string, b: string): number => {
  const parse = (value: string) =>
    String(value || '')
      .trim()
      .replace(/^[vV]/, '')
      .split(/[.+-]/)
      .map(part => Number.parseInt(part, 10))
      .map(num => (Number.isFinite(num) ? num : 0))
  const left = parse(a)
  const right = parse(b)
  const len = Math.max(left.length, right.length)
  for (let i = 0; i < len; i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0)
    if (diff > 0) return 1
    if (diff < 0) return -1
  }
  return 0
}

/** 用户点掉某版本的通知：同一版本不再提醒（更新的版本出来照常提醒） */
export const dismissRelease = (tag: string) => {
  saveState({ ...loadState(), dismissedTag: String(tag || '') })
}

/** 有比当前更新的版本且未被点掉时返回信息，否则一律返回 null（含所有异常） */
export const checkForNewRelease = async (): Promise<NewReleaseInfo | null> => {
  if (!isTauriRuntime()) return null
  const state = loadState()
  if (Date.now() - state.lastCheckedAt < CHECK_INTERVAL_MS) return null
  try {
    const [{ fetch: tauriFetch }, { getVersion }] = await Promise.all([
      import('@tauri-apps/plugin-http'),
      import('@tauri-apps/api/app'),
    ])
    const response = await tauriFetch(GITHUB_LATEST_RELEASE_API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      connectTimeout: 10_000,
    })
    // 查过就记时间：请求失败也别在一天里反复打 GitHub
    saveState({ ...state, lastCheckedAt: Date.now() })
    if (!response.ok) return null
    const body = (await response.json()) as { tag_name?: string; name?: string; html_url?: string }
    const tag = String(body?.tag_name || '').trim()
    if (!tag || tag === loadState().dismissedTag) return null
    const current = await getVersion()
    if (compareVersions(tag, current) <= 0) return null
    return {
      tag,
      name: String(body?.name || '').trim(),
      url: String(body?.html_url || '').trim() || GITHUB_RELEASES_URL,
    }
  } catch {
    return null
  }
}
