/**
 * 时间格式化统一工具：收敛各组件私有的 formatDate / formatDateTime / formatTime 实现。
 *
 * 说明：这里刻意用原生 Date + 模式替换实现（模式 token 与 dayjs 一致：
 * YYYY / MM / DD / HH / mm / ss），而不用 dayjs.format——dayjs 对无效时间
 * 输出 'Invalid Date'，会改变旧实现（NaN 部件原样拼接）的无效输入返回值。
 */

export type DateInput = string | number | Date | null | undefined

const pad2 = (value: number) => String(value).padStart(2, '0')

const toDate = (value: string | number | Date) =>
  value instanceof Date ? value : new Date(value)

const formatByPattern = (date: Date, pattern: string) =>
  pattern
    .replace(/YYYY/g, String(date.getFullYear()))
    .replace(/MM/g, pad2(date.getMonth() + 1))
    .replace(/DD/g, pad2(date.getDate()))
    .replace(/HH/g, pad2(date.getHours()))
    .replace(/mm/g, pad2(date.getMinutes()))
    .replace(/ss/g, pad2(date.getSeconds()))

export function formatDateTimeLoose(value: DateInput, pattern: string, emptyText = ''): string {
  if (!value) return emptyText
  return formatByPattern(toDate(value), pattern)
}

/**
 * 空值回退为当前时间的格式化（原 ArtistModal 私有实现）：
 * 无效输入同样按 NaN 部件原样输出。
 */
export function formatDateTimeOrNow(
  value: number | string | undefined,
  pattern = 'YYYY-MM-DD HH:mm'
): string {
  return formatByPattern(new Date(value || Date.now()), pattern)
}

/**
 * 本地化完整时间（原 SettingsCenterModal 私有实现）：
 * 空值返回 emptyText，其余走 Date#toLocaleString()（含无效输入 'Invalid Date'）。
 */
export function formatLocaleDateTime(value: DateInput, emptyText = '-'): string {
  if (!value) return emptyText
  return toDate(value).toLocaleString()
}

/**
 * zh-CN 本地化「月/日 时:分」（原 WorkflowBook/History 私有实现，输出如 '07/07 14:30'）：
 * 空值返回 '-'，无效时间回传原始输入。
 */
export function formatMonthDayTime(value: DateInput): string {
  if (!value) return '-'
  const date = toDate(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
