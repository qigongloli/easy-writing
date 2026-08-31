/**
 * 提示词库的结构定义。
 *
 * 全部 AI 提示词以 md 文件形式存在本地（桌面端在「文稿/易创写作提示词/」目录），
 * 用户既可在设置中心的可视化界面里改，也可直接编辑 md 文件（启动时读入）。
 * 代码里只保留默认文本：用于首次生成 md 文件与"恢复默认"。
 *
 * 一个"提示词文件"对应一个场景组（一个 md 文件），内含若干"文本槽"——
 * 每个槽是一段可独立编辑的提示词文本（系统人设 / 任务指令 / 处理方式等）。
 * 动态内容（正文、选中文本、变量参数）由代码在运行时代入 {{变量}} 占位符。
 * JSON 输出契约（形状）与模型采样温度也放在 md 里，用户可见可改——
 * 形状改坏会导致解析失败，删掉该 md 文件即可恢复默认。
 */

export interface PromptSlotDef {
  /** 槽的稳定标识（代码取文本用） */
  key: string
  /** md 文件里的分段标题（## 槽名），也是编辑界面的字段名 */
  label: string
  /** 该槽支持的 {{变量}} 列表（展示给用户；空 = 纯文本原样使用） */
  variables?: string[]
  /** 默认文本（首次生成 md 与恢复默认用） */
  defaultText: string
  /**
   * 该槽的模型采样温度（0-2）。写进 md 的「温度：x」行，用户可改；
   * 未定义 = 该场景不调温，用模型默认值。数值沿用老服务端逐场景调优。
   */
  defaultTemperature?: number
}

export interface PromptFileDef {
  /** 稳定标识：写进 md frontmatter，文件被重命名也能对上号 */
  id: string
  /** md 文件名（不含扩展名）与界面里的场景名 */
  name: string
  /** 界面分组 */
  group: string
  /** 一句话说明这组提示词管什么 */
  description: string
  slots: PromptSlotDef[]
}
