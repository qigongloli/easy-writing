import type { JsonRecord } from '@/types/json'


export type TimelineLineType = 'main' | 'branch'
export type StorylineLineType = 'main' | 'branch' | 'character' | 'emotion' | 'foreshadow'
export type StorylineStatus = 'active' | 'pending' | 'closed'
export type StorylineRelationType = 'drive' | 'dependency' | 'influence' | 'foreshadow' | 'conflict'
export type StorylineNodeType = 'plot' | 'character' | 'clue' | 'location' | 'organization' | 'goal' | 'ability' | 'turning' | 'custom'
export type StorylineNodeStatus = 'draft' | 'active' | 'closed'
export type StorylineNodeRelationType = 'branch' | 'peer' | 'link' | 'cause' | 'influence' | 'foreshadow' | 'conflict'

export interface TimelineEvent {
  id: number
  userId: string
  bookId: string
  storylineId?: string | null
  chapterId?: string | null
  title: string
  lineType: TimelineLineType
  timeLabel?: string
  timePoint?: string
  timeOrder: number
  parallelGroupId?: string | null
  location?: string
  summary?: string
  cause?: string
  effect?: string
  conflictLevel: number
  characterIds: string[]
  settingIds: string[]
  relatedEventIds: string[]
  note?: string
  payload?: JsonRecord | null
  createTime?: string
  updateTime?: string
}

export interface Storyline {
  id: number
  userId: string
  bookId: string
  title: string
  lineType: StorylineLineType
  status: StorylineStatus
  importance: number
  chapterRangeText?: string
  goal?: string
  conflict?: string
  summary?: string
  firstChapterId?: string | null
  revealChapterId?: string | null
  keyCharacterIds: string[]
  hookCount: number
  pendingHookCount: number
  payload?: JsonRecord | null
  createTime?: string
  updateTime?: string
}

export interface StorylineRelation {
  id?: number
  userId?: string
  bookId?: string
  fromStorylineId: string
  toStorylineId: string
  relationType: StorylineRelationType
  description?: string
  strength: number
}

export interface StorylineNode {
  id: number
  userId: string
  bookId: string
  storylineId: string
  title: string
  nodeType: StorylineNodeType
  status: StorylineNodeStatus
  summary?: string
  location?: string
  chapterIds: string[]
  characterIds: string[]
  settingIds: string[]
  predecessorNodeIds: string[]
  successorNodeIds: string[]
  tags: string[]
  positionX: number
  positionY: number
  sortNo: number
  payload?: JsonRecord | null
  createTime?: string
  updateTime?: string
}

export interface StorylineNodeRelation {
  id?: number
  userId?: string
  bookId?: string
  fromNodeId: string
  toNodeId: string
  relationType: StorylineNodeRelationType
  description?: string
  strength: number
}

export interface PlotBinding {
  id: number
  userId: string
  bookId: string
  storylineNodeId?: string | null
  timelineEventId?: string | null
  chapterId?: string | null
  anchorStart?: number | null
  anchorEnd?: number | null
  anchorText?: string
  anchorLabel?: string
  note?: string
  payload?: JsonRecord | null
  createTime?: string
  updateTime?: string
}

export interface StorylineListResult {
  storylines: Storyline[]
  relations: StorylineRelation[]
  nodes: StorylineNode[]
  nodeRelations: StorylineNodeRelation[]
  timelineEvents: TimelineEvent[]
  bindings: PlotBinding[]
}

export type TimelineEventPayload = Partial<Omit<TimelineEvent, 'id' | 'userId' | 'bookId' | 'createTime' | 'updateTime'>> & {
  id?: number
  bookId: string | number
  title: string
}

export type StorylinePayload = Partial<Omit<Storyline, 'id' | 'userId' | 'bookId' | 'createTime' | 'updateTime'>> & {
  id?: number
  bookId: string | number
  title: string
}

export type StorylineNodePayload = Partial<Omit<StorylineNode, 'id' | 'userId' | 'bookId' | 'createTime' | 'updateTime'>> & {
  id?: number
  bookId: string | number
  storylineId?: string | number | null
  title: string
}

export type PlotBindingPayload = Partial<Omit<PlotBinding, 'id' | 'userId' | 'bookId' | 'createTime' | 'updateTime'>> & {
  id?: number
  bookId: string | number
}
