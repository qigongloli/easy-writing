import dayjs from 'dayjs'

/**
 * 本地码字统计：替代旧服务端 /writing/statistics 三接口的数据源。
 *
 * 记账方式：写作台每次落盘章节时上报该章最新字数，这里与上一次基线求差，
 * 正向增量记入「当天 × 书」的账本（净增口径：删 100 再写 100 会记 100）。
 * 章节首次见到时只建基线不记账，避免把存量章节的全文算成当天码字。
 *
 * 存储：localStorage 单键 JSON。数据量小（每天每本书一条数字），
 * 桌面端 WebView 的 localStorage 同样跟随应用数据目录持久化。
 *
 * AI 记账：AI 文字进正文的口子各自调 recordAiWordsAdded（编辑器内插字）或
 * recordAiChapterLanding（工作流整章落稿）。两者都会同步抬高该章基线，
 * 编辑器随后的自动落盘按基线求差时就只剩手写部分，不会双记。
 */

export interface LocalStatsDayItem {
  date: string
  words: number
  manualWords: number
  aiWords: number
}

export interface LocalStatsOverview {
  date: string
  targetWords: number
  manualTargetWords: number
  aiTargetWords: number
  todayWords: number
  manualWords: number
  aiWords: number
}

export interface LocalStatsTrend {
  days: number
  startDate: string
  endDate: string
  totalWords: number
  totalManualWords: number
  totalAiWords: number
  list: LocalStatsDayItem[]
}

export interface LocalStatsCalendar {
  month: string
  monthTotalWords: number
  monthManualWords: number
  monthAiWords: number
  monthAvgWords: number
  monthManualAvgWords: number
  monthAiAvgWords: number
  list: LocalStatsDayItem[]
}

interface DayBookRecord {
  manual: number
  ai: number
}

interface StatsFile {
  version: 1
  targets: { manual: number; ai: number }
  /** days['YYYY-MM-DD'][bookId] = 当天该书的净增字数 */
  days: Record<string, Record<string, DayBookRecord>>
  /** 每章最近一次落盘的字数基线；key = `${bookId}:${chapterId}` */
  chapterBase: Record<string, number>
}

const STORAGE_KEY = 'ew-local-write-stats'
const DEFAULT_DAILY_TARGET = 4000
const MAX_DAY_RECORDS = 400

const emptyFile = (): StatsFile => ({
  version: 1,
  targets: { manual: DEFAULT_DAILY_TARGET, ai: DEFAULT_DAILY_TARGET },
  days: {},
  chapterBase: {}
})

const loadFile = (): StatsFile => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyFile()
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.version !== 1) return emptyFile()
    return {
      version: 1,
      targets: {
        manual: Number(parsed.targets?.manual) >= 0 ? Number(parsed.targets.manual) : DEFAULT_DAILY_TARGET,
        ai: Number(parsed.targets?.ai) >= 0 ? Number(parsed.targets.ai) : DEFAULT_DAILY_TARGET
      },
      days: parsed.days && typeof parsed.days === 'object' ? parsed.days : {},
      chapterBase: parsed.chapterBase && typeof parsed.chapterBase === 'object' ? parsed.chapterBase : {}
    }
  } catch (error) {
    console.warn('读取本地码字统计失败，重建空账本', error)
    return emptyFile()
  }
}

const saveFile = (file: StatsFile) => {
  // 只保留最近 MAX_DAY_RECORDS 天，账本体积有上界
  const dates = Object.keys(file.days).sort()
  if (dates.length > MAX_DAY_RECORDS) {
    for (const date of dates.slice(0, dates.length - MAX_DAY_RECORDS)) {
      delete file.days[date]
    }
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(file))
  } catch (error) {
    console.warn('写入本地码字统计失败', error)
  }
}

const today = () => dayjs().format('YYYY-MM-DD')

const sumDay = (day: Record<string, DayBookRecord> | undefined, bookId?: string) => {
  let manual = 0
  let ai = 0
  if (day) {
    for (const [id, record] of Object.entries(day)) {
      if (bookId && id !== bookId) continue
      manual += Number(record?.manual || 0)
      ai += Number(record?.ai || 0)
    }
  }
  return { manual, ai, total: manual + ai }
}

/** 章节加载完成时焊基线：只在还没有基线时写入，不记账。
 *  不做这一步的话，已有章节的第一段输入会在首次落盘时被当成存量吞掉。 */
export const primeChapterWords = (
  bookId: string | number,
  chapterId: string | number,
  wordCount: number
) => {
  const file = loadFile()
  const baseKey = `${String(bookId)}:${String(chapterId)}`
  if (file.chapterBase[baseKey] !== undefined) return
  file.chapterBase[baseKey] = Math.max(0, Math.round(Number(wordCount) || 0))
  saveFile(file)
}

/** 写作台每次落盘调用：上报某章当前字数，内部按基线差记账 */
export const recordChapterWords = (
  bookId: string | number,
  chapterId: string | number,
  wordCount: number
) => {
  const count = Math.max(0, Math.round(Number(wordCount) || 0))
  const baseKey = `${String(bookId)}:${String(chapterId)}`
  const file = loadFile()
  const base = file.chapterBase[baseKey]
  file.chapterBase[baseKey] = count
  if (base === undefined) {
    // 首次见到该章：只建基线，不把存量字数记成今天的码字
    saveFile(file)
    return
  }
  const delta = count - base
  if (delta <= 0) {
    saveFile(file)
    return
  }
  const date = today()
  const bookKey = String(bookId)
  const day = (file.days[date] ||= {})
  const record = (day[bookKey] ||= { manual: 0, ai: 0 })
  record.manual += delta
  saveFile(file)
}

/** 编辑器内 AI 插字（划词改写/快捷续写/幽灵字采纳/取名插入）：字数记 AI，
 *  基线同步抬高，随后的自动落盘不会把这批字再记成手写。
 *  传负数用于「废弃改写」回冲：AI 计数与基线一并回退（都不小于 0）。 */
export const recordAiWordsAdded = (
  bookId: string | number,
  chapterId: string | number,
  wordDelta: number
) => {
  const delta = Math.round(Number(wordDelta) || 0)
  if (!delta) return
  const file = loadFile()
  const baseKey = `${String(bookId)}:${String(chapterId)}`
  const base = file.chapterBase[baseKey]
  if (base !== undefined) {
    file.chapterBase[baseKey] = Math.max(0, base + delta)
  }
  const date = today()
  const day = (file.days[date] ||= {})
  const record = (day[String(bookId)] ||= { manual: 0, ai: 0 })
  record.ai = Math.max(0, record.ai + delta)
  saveFile(file)
}

/** 工作流整章落稿：与基线求差记 AI（新章没基线=整章都算 AI），基线抬到当前值。
 *  流式生成会多次落稿，按基线差累计恰好等于全文净增，不会重复记。 */
export const recordAiChapterLanding = (
  bookId: string | number,
  chapterId: string | number,
  wordCount: number
) => {
  const count = Math.max(0, Math.round(Number(wordCount) || 0))
  const baseKey = `${String(bookId)}:${String(chapterId)}`
  const file = loadFile()
  const delta = count - (file.chapterBase[baseKey] ?? 0)
  file.chapterBase[baseKey] = count
  if (delta <= 0) {
    saveFile(file)
    return
  }
  const date = today()
  const day = (file.days[date] ||= {})
  const record = (day[String(bookId)] ||= { manual: 0, ai: 0 })
  record.ai += delta
  saveFile(file)
}

export const getStatsTargets = () => {
  const { targets } = loadFile()
  return { manual: targets.manual, ai: targets.ai, total: targets.manual + targets.ai }
}

export const setStatsTargets = (targets: { manual: number; ai: number }) => {
  const file = loadFile()
  file.targets = {
    manual: Math.max(0, Math.round(Number(targets.manual) || 0)),
    ai: Math.max(0, Math.round(Number(targets.ai) || 0))
  }
  saveFile(file)
}

export const getStatsOverview = (date?: string, bookId?: string | number): LocalStatsOverview => {
  const file = loadFile()
  const day = file.days[date || today()]
  const { manual, ai, total } = sumDay(day, bookId === undefined ? undefined : String(bookId))
  return {
    date: date || today(),
    targetWords: file.targets.manual + file.targets.ai,
    manualTargetWords: file.targets.manual,
    aiTargetWords: file.targets.ai,
    todayWords: total,
    manualWords: manual,
    aiWords: ai
  }
}

export const getStatsTrend = (
  days: number,
  endDate?: string,
  bookId?: string | number
): LocalStatsTrend => {
  const file = loadFile()
  const span = Math.min(Math.max(Math.round(days) || 7, 1), 90)
  const end = dayjs(endDate || today())
  const filterBook = bookId === undefined ? undefined : String(bookId)
  const list: LocalStatsDayItem[] = []
  let totalManual = 0
  let totalAi = 0
  for (let offset = span - 1; offset >= 0; offset -= 1) {
    const date = end.subtract(offset, 'day').format('YYYY-MM-DD')
    const { manual, ai, total } = sumDay(file.days[date], filterBook)
    totalManual += manual
    totalAi += ai
    list.push({ date, words: total, manualWords: manual, aiWords: ai })
  }
  return {
    days: span,
    startDate: end.subtract(span - 1, 'day').format('YYYY-MM-DD'),
    endDate: end.format('YYYY-MM-DD'),
    totalWords: totalManual + totalAi,
    totalManualWords: totalManual,
    totalAiWords: totalAi,
    list
  }
}

export const getStatsCalendar = (month: string, bookId?: string | number): LocalStatsCalendar => {
  const file = loadFile()
  const start = dayjs(`${month}-01`)
  const filterBook = bookId === undefined ? undefined : String(bookId)
  const daysInMonth = start.daysInMonth()
  // 日均分母：当月为已过天数，历史月为整月天数
  const elapsed = start.isSame(dayjs(), 'month') ? dayjs().date() : daysInMonth
  const list: LocalStatsDayItem[] = []
  let totalManual = 0
  let totalAi = 0
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = start.date(day).format('YYYY-MM-DD')
    const { manual, ai, total } = sumDay(file.days[date], filterBook)
    totalManual += manual
    totalAi += ai
    if (total > 0) {
      list.push({ date, words: total, manualWords: manual, aiWords: ai })
    }
  }
  const divisor = Math.max(1, elapsed)
  return {
    month,
    monthTotalWords: totalManual + totalAi,
    monthManualWords: totalManual,
    monthAiWords: totalAi,
    monthAvgWords: Math.round((totalManual + totalAi) / divisor),
    monthManualAvgWords: Math.round(totalManual / divisor),
    monthAiAvgWords: Math.round(totalAi / divisor),
    list
  }
}

/** 连续创作天数：从今天（今天没写则从昨天）往前数连续有码字的天数 */
export const getStatsStreak = (): number => {
  const file = loadFile()
  let cursor = dayjs()
  if (sumDay(file.days[cursor.format('YYYY-MM-DD')]).total <= 0) {
    cursor = cursor.subtract(1, 'day')
  }
  let streak = 0
  while (sumDay(file.days[cursor.format('YYYY-MM-DD')]).total > 0) {
    streak += 1
    cursor = cursor.subtract(1, 'day')
  }
  return streak
}
