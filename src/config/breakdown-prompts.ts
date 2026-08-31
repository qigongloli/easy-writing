import type { LocalChatMessageInput } from '@/utils/local-ai-client'
import { promptText, renderPromptText } from '@/storage/local-prompts'

/**
 * 竞品拆书的提示词库：单章拆解 + 黄金三章深拆 + 全书汇总报告。
 * 产物 JSON 形状与工作台模板一一对应（outline 卡片/爽点节奏/设定/人物关系/
 * golden/report 各字段），改形状先对 Workbench.vue 的消费端。
 */

const materialBlock = (materials: Record<string, string>) =>
  Object.entries(materials)
    .filter(([, value]) => String(value ?? '').trim())
    .map(([key, value]) => `【${key}】\n${String(value).trim()}`)
    .join('\n\n')

const jsonSystem = (shape: string, extra = '') =>
  renderPromptText('breakdown', 'system', { JSON形状: shape, 补充要求: extra })

/** 单章拆解；前三章附加黄金三章深拆（golden 字段） */
export const buildChapterBreakdownMessages = (params: {
  bookTitle: string
  chapterTitle: string
  chapterNo: number
  paragraphs: string[]
  isGolden: boolean
}): LocalChatMessageInput[] => {
  const numbered = params.paragraphs
    .map((text, index) => `[${index + 1}] ${text}`)
    .join('\n')
  // 形状文本来自 md 提示词库（用户可改）；golden 深拆是把黄金三章形状拼进单章形状
  // 的收尾大括号——用户改坏形状导致拼接失败时，退化为并排展示两段形状说明
  const chapterShape = promptText('breakdown', 'chapterShape')
  const goldenShape = promptText('breakdown', 'goldenShape')
  const merged = chapterShape.replace(/\}\s*$/, `,"golden":${goldenShape}}`)
  const shape = params.isGolden
    ? (merged !== chapterShape ? merged : `${chapterShape}\ngolden 字段形状：${goldenShape}`)
    : chapterShape
  return [
    {
      role: 'system',
      content: jsonSystem(
        shape,
        [
          promptText('breakdown', 'chapterNote'),
          params.isGolden ? promptText('breakdown', 'goldenNote') : '',
        ]
          .filter(Boolean)
          .join('\n')
      ),
    },
    {
      role: 'user',
      content: [
        materialBlock({
          '书名': params.bookTitle,
          '章节': `第${params.chapterNo}章《${params.chapterTitle}》`,
          '正文（段落已编号）': numbered,
        }),
        `【任务】${promptText('breakdown', 'chapterTask')}`,
      ].join('\n\n'),
    },
  ]
}

/** 全书汇总报告：基于各章拆解产物聚合 */
export const buildBookReportMessages = (params: {
  bookTitle: string
  chapterBriefs: string[]
}): LocalChatMessageInput[] => [
  {
    role: 'system',
    content: jsonSystem(
      promptText('breakdown', 'reportShape'),
      promptText('breakdown', 'reportNote')
    ),
  },
  {
    role: 'user',
    content: [
      materialBlock({
        '书名': params.bookTitle,
        '各章拆解摘要': params.chapterBriefs.join('\n'),
      }),
      `【任务】${promptText('breakdown', 'reportTask')}`,
    ].join('\n\n'),
  },
]
