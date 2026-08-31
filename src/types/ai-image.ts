export type AiImageScene = 'character' | 'world' | 'cover'
export type AiWorldStyle = 'parchment' | 'satellite' | 'lineart' | 'rpg'

export interface AiImageGenerateReq {
  scene: AiImageScene
  title?: string
  prompt?: string
  negativePrompt?: string
  style?: AiWorldStyle | string
  size?: string
  quality?: string
  model?: string
  bookId?: number
}

export interface AiImageGenerateRes {
  id: number
  scene: AiImageScene | string
  title?: string
  prompt?: string
  negativePrompt?: string
  style?: string
  size?: string
  quality?: string
  modelCode?: string
  modelName?: string
  imageUrl: string
  createdAt?: string
}

export interface AiImageHistoryQuery {
  bookId?: number
  scene?: AiImageScene | string
  page?: number
  size?: number
}

export interface AiImageHistoryItem {
  id: number
  scene: string
  title?: string
  prompt?: string
  negativePrompt?: string
  style?: string
  size?: string
  quality?: string
  modelCode?: string
  modelName?: string
  imageUrl?: string
  status?: number
  errorMsg?: string
  createTime?: string
}
