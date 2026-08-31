
export type AiModelGroupCode = 'text_assist' | 'workflow_book' | 'image_generation'

export interface AiModelOption {
  id: number
  name: string
  code: string
  modelCode?: string
  scene: 'text' | 'image' | string
  provider?: string
  description?: string
  pointRate?: number
  /** 展示费率：与服务端计费同口径（含全局倍率），文本按千Token、生图按次 */
  displayCost?: number
  displayCostUnit?: string
  protocol?: string
  baseUrl?: string
  ownerType?: 'platform' | 'user'
  isMine?: boolean
  isVip?: boolean
  // 会员专属且当前用户非会员：展示锁定态，选择时引导开通会员
  vipLocked?: boolean
  isDefault?: boolean
  maxContext?: number
  maxOutputTokens?: number
  status?: number
  testStatus?: number
  lastTestAt?: string
  lastLatency?: number | null
  lastError?: string
  apiKeyMask?: string
}

export interface AiModelPolicyOption {
  groupCode: AiModelGroupCode | string
  groupName: string
  scene: 'text' | 'image' | string
  defaultModelId?: number | null
  selectableModelIds?: number[]
  allowUserSelect: boolean
  lockOnFirstUse: boolean
  status: number
}

export interface AiModelOptionsResult {
  policy: AiModelPolicyOption | null
  defaultModel: AiModelOption | null
  selectedModelCode?: string
  selectedModel?: AiModelOption | null
  models: AiModelOption[]
}
