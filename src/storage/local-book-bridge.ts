import type { JsonRecord } from '@/types/json'
import { getLocalLibraryStorage } from './local-library'
import { getWritingStorage } from '@/storage'
import { LOCAL_USER_ID } from './local-library-utils'

/**
 * 写作台工作流面板群的本地书桥接（替代老服务端 book 模块的四个接口，类型契约在 types/book）。
 *
 * 这些面板（细纲/单章重写/角色/世界观）原来只在服务端工作流书里出现，
 * 调用时只有 chapterId 没有 bookId——所以这里的详情读取按 id 反查章节记录
 * 拿到归属，再去正文库取草稿。契约与服务端一致：
 * - 章节详情带 planMeta（细纲）与 contentVersion（本地即草稿 remoteVersion）
 * - updateChapter 的 planMeta 做字段级合并（面板只传 expandedOutline+outlineSource）
 */

const ok = <T>(data: T) => ({ data })

export interface LocalChapterDetail {
  id: number
  bookId: string
  volumeId: string
  title: string
  summary: string
  textContent: string
  contentVersion: number
  planMeta: JsonRecord | null
  workflowStatus: string | null
}

/** 只凭 chapterId 读详情（正文 + 细纲 + 版本）；章节不存在时报错，不给假空章 */
export const getLocalChapterDetailById = async (
  params: { id: number | string },
  _opts?: Record<string, unknown>
) => {
  const chapter = await getLocalLibraryStorage().getLocalChapterById(Number(params.id))
  if (!chapter) throw new Error('章节不存在或已删除')
  const draft = await getWritingStorage().getChapterByIdentity(
    LOCAL_USER_ID,
    chapter.bookId,
    chapter.id
  )
  return ok<LocalChapterDetail>({
    id: chapter.id,
    bookId: chapter.bookId,
    volumeId: chapter.volumeId,
    title: draft?.title || chapter.title,
    summary: String(chapter.summary || ''),
    textContent: draft?.textContent || '',
    contentVersion: Number(draft?.remoteVersion || 0),
    planMeta: chapter.planMeta || null,
    workflowStatus: chapter.workflowStatus || null,
  })
}

/** 更新章节（标题/章纲/细纲）；planMeta 字段级合并，undefined 字段不动 */
export const updateLocalChapterData = async (payload: {
  id: number
  title?: string
  summary?: string
  planMeta?: JsonRecord | null
}) => {
  const storage = getLocalLibraryStorage()
  let mergedPlanMeta: JsonRecord | null | undefined = undefined
  if (payload.planMeta !== undefined) {
    if (payload.planMeta === null) {
      mergedPlanMeta = null
    } else {
      const current = await storage.getLocalChapterById(payload.id)
      mergedPlanMeta = { ...(current?.planMeta || {}), ...payload.planMeta }
    }
  }
  const updated = await storage.updateLocalChapter({
    id: payload.id,
    ...(payload.title !== undefined ? { title: payload.title } : {}),
    ...(payload.summary !== undefined ? { summary: payload.summary } : {}),
    ...(mergedPlanMeta !== undefined ? { planMeta: mergedPlanMeta } : {}),
  })
  if (!updated) throw new Error('章节不存在或已删除')
  return ok(updated)
}

/** 更新卷（标题/简介） */
export const updateLocalVolumeData = async (payload: {
  id: number
  title?: string
  summary?: string
}) => {
  const updated = await getLocalLibraryStorage().updateLocalVolume({
    id: payload.id,
    ...(payload.title !== undefined ? { title: payload.title } : {}),
    ...(payload.summary !== undefined ? { summary: payload.summary } : {}),
  })
  if (!updated) throw new Error('卷不存在或已删除')
  return ok(updated)
}

/**
 * 细纲面板的目录树（替代 getBookTreeApi 的 workflow 视图）。
 * 本地卷章记录自带 planMeta / workflowStatus，直接返回整棵树即可；
 * viewMode/runId/taskId 等服务端视图参数在本地没有意义，收下但不使用。
 */
export const getLocalWorkflowBookTree = async (
  params: { bookId: string | number } & Record<string, unknown>,
  _opts?: Record<string, unknown>
) => {
  const volumes = await getLocalLibraryStorage().getLocalBookTree(params.bookId)
  return ok(volumes)
}

/** 书籍分页清单（替代 queryBookApi；封面工坊绑定书籍的下拉用） */
export const queryLocalBookPage = async (
  params: { page?: number; size?: number; keyWord?: string },
  _opts?: Record<string, unknown>
) => {
  const books = await getLocalLibraryStorage().listLocalBooks({
    keyWord: params.keyWord,
    sortBy: 'updateTime',
    sortOrder: 'DESC',
  })
  const page = Math.max(1, Number(params.page || 1))
  const size = Math.max(1, Number(params.size || 100))
  return ok({
    list: books.slice((page - 1) * size, page * size),
    pagination: { page, size, total: books.length },
  })
}

/** 更新书籍字段（替代 updateBookApi；封面工坊"应用封面"回写 coverUrl 用） */
export const updateLocalBookData = async (
  payload: { id: number | string } & Record<string, unknown>,
  _opts?: Record<string, unknown>
) => {
  const updated = await getLocalLibraryStorage().updateLocalBook({
    ...(payload as { id: number }),
    id: Number(payload.id),
  })
  return ok(updated)
}
