import { computed } from 'vue'
import { useWritingEditorStore } from '@/stores/writing-editor'
import type { ChapterSaveState } from '@/stores/writing-editor'

export type GlobalSyncStatus = 'synced' | 'syncing' | 'unsynced'

// 保存进行中的状态：写入尚未落盘完成都算"保存中"。
const SYNCING_STATES: ChapterSaveState[] = ['dirty', 'saving', 'syncing', 'local_saved', 'pending']
// 保存失败/冲突：需要用户留意的"未保存"。
const UNSYNCED_STATES: ChapterSaveState[] = ['error', 'conflict', 'offline']

const STATUS_LABELS: Record<GlobalSyncStatus, string> = {
  synced: '已保存',
  syncing: '保存中',
  unsynced: '未保存',
}

const STATUS_DESCRIPTIONS: Record<GlobalSyncStatus, string> = {
  synced: '内容已保存在本机，一切正常。',
  syncing: '正在保存内容，请稍候。',
  unsynced: '有内容尚未保存成功，请回到写作页手动保存一次。',
}

/**
 * 全局保存状态：把写作编辑器的章节保存状态归并为 已保存/保存中/未保存 三档，
 * 给标题栏的状态胶囊用。纯本地应用，与网络在线与否无关。
 */
export function useGlobalSyncStatus() {
  const editorStore = useWritingEditorStore()

  const status = computed<GlobalSyncStatus>(() => {
    const state = editorStore.chapterSaveState
    if (UNSYNCED_STATES.includes(state)) return 'unsynced'
    if (SYNCING_STATES.includes(state)) return 'syncing'
    return 'synced'
  })

  const label = computed(() => STATUS_LABELS[status.value])
  const description = computed(() => STATUS_DESCRIPTIONS[status.value])

  return { status, label, description }
}
