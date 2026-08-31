export type AiRecordType = '' | 'text' | 'image'
export type AiRecordStatus = '' | '0' | '1' | '2'

export interface AiRecordPageQuery {
  page: number
  size: number
  recordType?: AiRecordType
  status?: AiRecordStatus
  scene?: string
  keyWord?: string
  startTime?: string
  endTime?: string
}

export interface AiRecordListItem {
  id: number
  recordType: 'text' | 'image'
  scene: string
  sceneLabel: string
  modelName: string
  modelCode: string
  status: number
  inputPreview: string
  outputPreview: string
  imageUrl?: string
  inputTokens: number
  outputTokens: number
  totalCost: number
  duration: number
  errorMsg?: string
  bookId?: number | null
  chapterId?: number | null
  createTime: string
}

export interface AiRecordSummary {
  total: number
  successTotal: number
  failTotal: number
  runningTotal: number
  inputTokens: number
  outputTokens: number
  totalCost: number
}
