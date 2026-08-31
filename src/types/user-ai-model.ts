export interface UserAiModelSavePayload {
  id?: number
  name: string
  scene: 'text' | 'image'
  provider: string
  protocol: 'openai_compatible'
  modelCode: string
  baseUrl: string
  apiKey?: string
  maxContext: number
  maxOutputTokens: number
  status: number
  sort?: number
}

export interface UserAiModelTestResult {
  ok: boolean
  message: string
  latency: number
  url: string
  testedAt: string
}

export interface UserAiRemoteModelListResult {
  models: string[]
  total: number
  url: string
  latency: number
  testedAt: string
}
