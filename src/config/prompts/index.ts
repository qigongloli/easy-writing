import type { PromptFileDef } from './types'
import { WRITING_PROMPT_FILES } from './defaults-writing'
import { WORKFLOW_PROMPT_FILES } from './defaults-workflow'
import { MISC_PROMPT_FILES } from './defaults-misc'

export type { PromptFileDef, PromptSlotDef } from './types'

/** 全部提示词文件定义（分组顺序即界面展示顺序） */
export const PROMPT_FILE_DEFS: PromptFileDef[] = [
  ...WRITING_PROMPT_FILES,
  ...WORKFLOW_PROMPT_FILES,
  ...MISC_PROMPT_FILES,
]

export const findPromptFileDef = (fileId: string): PromptFileDef | null =>
  PROMPT_FILE_DEFS.find(def => def.id === fileId) || null
