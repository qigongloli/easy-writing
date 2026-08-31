import type {
  PlotBinding,
  PlotBindingPayload,
  Storyline,
  StorylineListResult,
  StorylineNode,
  StorylineNodePayload,
  StorylineNodeRelation,
  StorylinePayload,
  TimelineEvent,
  TimelineEventPayload,
} from '@/types/plot'
import { LOCAL_USER_ID, nowIso } from './local-library-utils'
import {
  applyDefined,
  findBookIdByEntity,
  idSet,
  mutateDoc,
  nextLocalId,
  ok,
  readDoc,
} from './local-reference-store'

/**
 * 参考面板本地库·剧情域（时间线/故事线/正文锚点）：替代旧服务端
 * /writing/timeline、/writing/storyline 数据通道。
 * 语义约定与书域（local-reference.ts）一致：{ data } 信封、undefined 不动/null 清空。
 */

// ---------------------------------------------------------------------------
// 时间线事件
// ---------------------------------------------------------------------------

export const listLocalTimelineEvents = async (params: { bookId: string | number }) => {
  const doc = await readDoc(params.bookId)
  const list = [...doc.timelineEvents].sort(
    (a, b) => (a.timeOrder ?? 0) - (b.timeOrder ?? 0) || a.id - b.id
  )
  return ok(list)
}

export const addLocalTimelineEvent = async (payload: TimelineEventPayload) => {
  return mutateDoc(payload.bookId, doc => {
    const maxOrder = doc.timelineEvents.reduce((max, item) => Math.max(max, item.timeOrder ?? 0), 0)
    const event: TimelineEvent = {
      id: nextLocalId(),
      userId: LOCAL_USER_ID,
      bookId: String(payload.bookId),
      storylineId: payload.storylineId ?? null,
      chapterId: payload.chapterId ?? null,
      title: payload.title,
      lineType: payload.lineType ?? 'main',
      timeLabel: payload.timeLabel ?? '',
      timePoint: payload.timePoint ?? '',
      timeOrder: payload.timeOrder ?? maxOrder + 10,
      parallelGroupId: payload.parallelGroupId ?? null,
      location: payload.location ?? '',
      summary: payload.summary ?? '',
      cause: payload.cause ?? '',
      effect: payload.effect ?? '',
      conflictLevel: payload.conflictLevel ?? 0,
      characterIds: payload.characterIds ?? [],
      settingIds: payload.settingIds ?? [],
      relatedEventIds: payload.relatedEventIds ?? [],
      note: payload.note ?? '',
      payload: payload.payload ?? null,
      createTime: nowIso(),
      updateTime: nowIso(),
    }
    doc.timelineEvents.push(event)
    return ok(event)
  })
}

export const updateLocalTimelineEvent = async (payload: TimelineEventPayload & { id: number }) => {
  return mutateDoc(payload.bookId, doc => {
    const event = doc.timelineEvents.find(item => item.id === payload.id)
    if (!event) throw new Error('时间节点不存在')
    const { id: _id, bookId: _bookId, ...fields } = payload
    applyDefined(event, fields)
    event.updateTime = nowIso()
    return ok(event)
  })
}

export const deleteLocalTimelineEvents = async (payload: { ids: number[] }) => {
  const bookId = await findBookIdByEntity(payload.ids[0], doc => doc.timelineEvents)
  return mutateDoc(bookId, doc => {
    const doomed = idSet(payload.ids)
    doc.timelineEvents = doc.timelineEvents.filter(item => !doomed.has(String(item.id)))
    // 级联清掉指向这些事件的正文锚点
    doc.plotBindings = doc.plotBindings.filter(
      item => !(item.timelineEventId && doomed.has(String(item.timelineEventId)))
    )
    return ok(null)
  })
}

export const saveLocalTimelineEventOrder = async (payload: {
  bookId: string | number
  orders: Array<{ id: number; timeOrder: number }>
}) => {
  return mutateDoc(payload.bookId, doc => {
    const orderById = new Map(payload.orders.map(item => [String(item.id), item.timeOrder]))
    for (const event of doc.timelineEvents) {
      const timeOrder = orderById.get(String(event.id))
      if (timeOrder !== undefined) {
        event.timeOrder = timeOrder
        event.updateTime = nowIso()
      }
    }
    return ok(doc.timelineEvents)
  })
}

// ---------------------------------------------------------------------------
// 故事线、故事节点、节点关系与正文锚点
// ---------------------------------------------------------------------------

export const getLocalStorylineBundle = async (params: { bookId: string | number }) => {
  const doc = await readDoc(params.bookId)
  const bundle: StorylineListResult = {
    storylines: [...doc.storylines],
    relations: [...doc.storylineRelations],
    nodes: [...doc.storylineNodes],
    nodeRelations: [...doc.storylineNodeRelations],
    timelineEvents: [...doc.timelineEvents],
    bindings: [...doc.plotBindings],
  }
  return ok(bundle)
}

export const addLocalStoryline = async (payload: StorylinePayload) => {
  return mutateDoc(payload.bookId, doc => {
    const storyline: Storyline = {
      id: nextLocalId(),
      userId: LOCAL_USER_ID,
      bookId: String(payload.bookId),
      title: payload.title,
      lineType: payload.lineType ?? 'main',
      status: payload.status ?? 'active',
      importance: payload.importance ?? 3,
      chapterRangeText: payload.chapterRangeText ?? '',
      goal: payload.goal ?? '',
      conflict: payload.conflict ?? '',
      summary: payload.summary ?? '',
      firstChapterId: payload.firstChapterId ?? null,
      revealChapterId: payload.revealChapterId ?? null,
      keyCharacterIds: payload.keyCharacterIds ?? [],
      hookCount: payload.hookCount ?? 0,
      pendingHookCount: payload.pendingHookCount ?? 0,
      payload: payload.payload ?? null,
      createTime: nowIso(),
      updateTime: nowIso(),
    }
    doc.storylines.push(storyline)
    return ok(storyline)
  })
}

export const addLocalStorylineNode = async (payload: StorylineNodePayload) => {
  return mutateDoc(payload.bookId, doc => {
    const node: StorylineNode = {
      id: nextLocalId(),
      userId: LOCAL_USER_ID,
      bookId: String(payload.bookId),
      storylineId: payload.storylineId != null ? String(payload.storylineId) : '',
      title: payload.title,
      nodeType: payload.nodeType ?? 'plot',
      status: payload.status ?? 'draft',
      summary: payload.summary ?? '',
      location: payload.location ?? '',
      chapterIds: payload.chapterIds ?? [],
      characterIds: payload.characterIds ?? [],
      settingIds: payload.settingIds ?? [],
      predecessorNodeIds: payload.predecessorNodeIds ?? [],
      successorNodeIds: payload.successorNodeIds ?? [],
      tags: payload.tags ?? [],
      positionX: payload.positionX ?? 0,
      positionY: payload.positionY ?? 0,
      sortNo: payload.sortNo ?? doc.storylineNodes.length * 10 + 10,
      payload: payload.payload ?? null,
      createTime: nowIso(),
      updateTime: nowIso(),
    }
    doc.storylineNodes.push(node)
    return ok(node)
  })
}

export const updateLocalStorylineNode = async (payload: StorylineNodePayload & { id: number }) => {
  return mutateDoc(payload.bookId, doc => {
    const node = doc.storylineNodes.find(item => item.id === payload.id)
    if (!node) throw new Error('故事节点不存在')
    const { id: _id, bookId: _bookId, storylineId, ...fields } = payload
    applyDefined(node, fields)
    if (storylineId !== undefined) {
      node.storylineId = storylineId != null ? String(storylineId) : ''
    }
    node.updateTime = nowIso()
    return ok(node)
  })
}

export const deleteLocalStorylineNodes = async (payload: { ids: number[] }) => {
  const bookId = await findBookIdByEntity(payload.ids[0], doc => doc.storylineNodes)
  return mutateDoc(bookId, doc => {
    const doomed = idSet(payload.ids)
    doc.storylineNodes = doc.storylineNodes.filter(item => !doomed.has(String(item.id)))
    // 级联清掉节点间连线与指向节点的正文锚点
    doc.storylineNodeRelations = doc.storylineNodeRelations.filter(
      item => !doomed.has(String(item.fromNodeId)) && !doomed.has(String(item.toNodeId))
    )
    doc.plotBindings = doc.plotBindings.filter(
      item => !(item.storylineNodeId && doomed.has(String(item.storylineNodeId)))
    )
    return ok(null)
  })
}

export const saveLocalStorylineNodePositions = async (payload: {
  bookId: string | number
  positions: Array<{ id: number; positionX: number; positionY: number }>
}) => {
  return mutateDoc(payload.bookId, doc => {
    const positionById = new Map(payload.positions.map(item => [String(item.id), item]))
    for (const node of doc.storylineNodes) {
      const position = positionById.get(String(node.id))
      if (position) {
        node.positionX = position.positionX
        node.positionY = position.positionY
        node.updateTime = nowIso()
      }
    }
    return ok(doc.storylineNodes)
  })
}

/** 整表替换语义：与服务端 storylineNodeRelationSave 保持一致 */
export const saveLocalStorylineNodeRelations = async (payload: {
  bookId: string | number
  relations: Array<Omit<StorylineNodeRelation, 'id' | 'userId' | 'bookId'>>
}) => {
  return mutateDoc(payload.bookId, doc => {
    doc.storylineNodeRelations = payload.relations.map(item => ({
      ...item,
      id: nextLocalId(),
      userId: LOCAL_USER_ID,
      bookId: String(payload.bookId),
    }))
    return ok(doc.storylineNodeRelations)
  })
}

export const addLocalPlotBinding = async (payload: PlotBindingPayload) => {
  return mutateDoc(payload.bookId, doc => {
    const binding: PlotBinding = {
      id: nextLocalId(),
      userId: LOCAL_USER_ID,
      bookId: String(payload.bookId),
      storylineNodeId: payload.storylineNodeId || null,
      timelineEventId: payload.timelineEventId || null,
      chapterId: payload.chapterId || null,
      anchorStart: payload.anchorStart ?? null,
      anchorEnd: payload.anchorEnd ?? null,
      anchorText: payload.anchorText ?? '',
      anchorLabel: payload.anchorLabel ?? '',
      note: payload.note ?? '',
      payload: payload.payload ?? null,
      createTime: nowIso(),
      updateTime: nowIso(),
    }
    doc.plotBindings.push(binding)
    return ok(binding)
  })
}

export const deleteLocalPlotBindings = async (payload: { ids: number[] }) => {
  const bookId = await findBookIdByEntity(payload.ids[0], doc => doc.plotBindings)
  return mutateDoc(bookId, doc => {
    const doomed = idSet(payload.ids)
    doc.plotBindings = doc.plotBindings.filter(item => !doomed.has(String(item.id)))
    return ok(null)
  })
}
