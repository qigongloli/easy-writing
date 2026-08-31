/**
 * 本地版本历史。
 *
 * 「仅本地」模式和本地书库都不上传正文，服务端自然没有历史版本可查，
 * 而本地 chapter_versions 表此前只写不读、也只在云端快照/冲突时才写——
 * 等于本地写作完全没有版本可回退。这里补上写入侧。
 *
 * 节流：正文每停手 160ms 就落一次盘，不能每次都存版本。
 * 满足任一条件才存：距上一版 ≥5 分钟，或字数变化 ≥200。
 * 保留：每章只留最近 N 版（跟随本地备份的 backupRetention，默认 20）。
 */

import { getWritingStorage } from './index'
import { recordWriteJournal } from './write-journal'
import {
  countDraftWords,
  DEFAULT_LOCAL_WRITING_SETTINGS,
  type StoredLocalChapterDraft,
} from './writing-storage'

const MIN_INTERVAL_MS = 5 * 60 * 1000
const MIN_WORD_DELTA = 200
// 首版的最小体量。新建章节敲下第一个字就立基线，留下的是「7 字」这种没有回退价值的
// 残片，还白占一个保留位。等写出一段再立，基线才有意义。
const MIN_FIRST_WORDS = 50

interface VersionMark {
  at: number
  words: number
}

// 每章上一版的时间与字数。首次访问某章时从库里回填，之后走内存，
// 避免每次保存都去查一遍版本表。
const marks = new Map<string, VersionMark>()
// 捕获是 void 发射的，落盘每几百毫秒一次。没有这道闸，首次捕获完成前的并发调用
// 会各自判定"还没有版本、该存一版"，瞬间灌进一串几乎相同的快照。
const inFlight = new Set<string>()

const resolveMark = async (draft: StoredLocalChapterDraft): Promise<VersionMark | null> => {
  const cached = marks.get(draft.storageKey)
  if (cached) return cached
  const versions = await getWritingStorage().listChapterVersions(
    draft.userId,
    draft.bookId,
    draft.chapterId
  )
  const latest = versions[0]
  if (!latest) return null
  const mark = {
    at: Number(latest.createdAt || 0),
    words: countDraftWords(latest.textContent),
  }
  marks.set(draft.storageKey, mark)
  return mark
}

const shouldCapture = (mark: VersionMark | null, words: number) => {
  // 从未存过版本：先立一个基线，之后的回退才有参照物；但太短的残片不值得当基线。
  if (!mark) return words >= MIN_FIRST_WORDS
  if (Date.now() - mark.at >= MIN_INTERVAL_MS) return true
  return Math.abs(words - mark.words) >= MIN_WORD_DELTA
}

/**
 * 按节流策略决定是否为这次落盘留一个版本。
 * 失败只记日志：版本历史是附加能力，绝不能反过来影响正文保存。
 */
export const maybeCaptureLocalVersion = async (draft: StoredLocalChapterDraft) => {
  const words = countDraftWords(draft.textContent)
  // 空正文不值得占一个版本位，否则新建章节会先塞进来一条空版本。
  if (!words) return
  if (inFlight.has(draft.storageKey)) return
  inFlight.add(draft.storageKey)
  try {
    const storage = getWritingStorage()
    const mark = await resolveMark(draft)
    if (!shouldCapture(mark, words)) return

    const createdAt = Date.now()
    await storage.saveChapterVersion({
      userId: draft.userId,
      bookId: draft.bookId,
      chapterId: draft.chapterId,
      source: 'local',
      title: draft.title,
      textContent: draft.textContent,
      contentJson: draft.contentJson,
      remoteVersion: Number(draft.remoteVersion || 0),
      remark: '本地自动快照',
      createdAt,
    })
    marks.set(draft.storageKey, { at: createdAt, words })

    const settings = await storage.getLocalWritingSettings()
    await storage.pruneChapterVersions(
      draft.userId,
      draft.bookId,
      draft.chapterId,
      Number(settings.backupRetention || DEFAULT_LOCAL_WRITING_SETTINGS.backupRetention)
    )

    recordWriteJournal({
      at: createdAt,
      op: 'version',
      backend: 'sqlite',
      storageKey: draft.storageKey,
      chars: words,
      ok: true,
      detail: `keep=${settings.backupRetention}`,
    })
  } catch (error) {
    console.warn('本地版本快照失败', error)
    recordWriteJournal({
      at: Date.now(),
      op: 'version',
      backend: 'sqlite',
      storageKey: draft.storageKey,
      chars: words,
      ok: false,
      reason: String((error as Error)?.message || error).slice(0, 80),
    })
  } finally {
    inFlight.delete(draft.storageKey)
  }
}

/** 恢复历史版本后重置基线，避免刚恢复就因"字数变化大"立刻又存一版 */
export const resetLocalVersionMark = (storageKey: string) => {
  marks.delete(storageKey)
}
