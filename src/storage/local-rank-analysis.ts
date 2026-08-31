import type {
  NovelRankAuthorTrendResult,
  NovelRankCategoryDistributionResult,
  NovelRankChangeResult,
  NovelRankCompetitorResult,
  NovelRankItem,
  NovelRankTagTrendResult,
} from '@/types/novel-rank'
import {
  attachCompare,
  enabledSources,
  getLocalRankLatest,
  getLocalRankLatestAll,
  listSourceSnapshotDates,
  localDate,
  readNewestSnapshot,
  readSnapshot,
  toSourceOption,
} from './local-rank-store'

/**
 * 榜单分析口径（从 local-rank-store 拆出，全部从本机快照现算）。
 * 形状与老服务端契约一致，榜单页零改动消费；快照攒得越多趋势越有料。
 */

export const getLocalRankCategoryDistribution = async (params: {
  siteCode: string
  rankType?: string
  gender?: string
  statDate?: string
}): Promise<{ data: NovelRankCategoryDistributionResult }> => {
  const sources = enabledSources(params.siteCode, params)
  const counter = new Map<string, number>()
  let statDate: string | null = null
  let total = 0
  for (const source of sources) {
    const doc = params.statDate
      ? await readSnapshot(source.legacyId, params.statDate)
      : await readNewestSnapshot(source.legacyId)
    if (!doc) continue
    if (!statDate || doc.statDate > statDate) statDate = doc.statDate
    const option = toSourceOption(source)
    for (const item of doc.items) {
      const name = item.categoryName || option.categoryName || '未分类'
      counter.set(name, (counter.get(name) || 0) + 1)
      total += 1
    }
  }
  const list = [...counter.entries()]
    .map(([categoryName, count]) => ({
      categoryId: null,
      categoryCode: null,
      categoryName,
      count,
      ratio: total ? count / total : 0,
    }))
    .sort((a, b) => b.count - a.count)
  return { data: { statDate, total, list } }
}

/** 站点某天各源快照合并（分析用；同书取最好名次） */
const mergedDayItems = async (siteCode: string, filters: { rankType?: string; gender?: string }, date: string) => {
  const sources = enabledSources(siteCode, filters)
  const byKey = new Map<string, NovelRankItem>()
  for (const source of sources) {
    const doc = await readSnapshot(source.legacyId, date)
    if (!doc) continue
    for (const item of doc.items) {
      const key = item.bookId || item.bookTitle
      const existing = byKey.get(key)
      if (!existing || item.rankNo < existing.rankNo) byKey.set(key, item)
    }
  }
  return byKey
}

const dateRange = (days: number, endDate?: string) => {
  const end = endDate || localDate()
  const list: string[] = []
  const endTime = new Date(`${end}T00:00:00`).getTime()
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(endTime - offset * 86400000)
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    list.push(`${y}-${m}-${d}`)
  }
  return list
}

/**
 * 标签风向：把每日各源快照合并后按"二级分类（无则一级分类）"逐日计数，
 * 取总量 Top N 出趋势线。起点条目带二级分类，喂出来的标签最细；
 * 番茄/七猫退化为分类热度。
 */
export const getLocalRankTagTrends = async (params: {
  siteCode: string
  rankType?: string
  gender?: string
  days?: number
  topN?: number
}): Promise<{ data: NovelRankTagTrendResult }> => {
  const days = Math.max(2, Math.min(Number(params.days || 7), 60))
  const topN = Math.max(1, Math.min(Number(params.topN || 6), 12))
  const dates = dateRange(days)

  const countsByTag = new Map<string, Map<string, number>>()
  const totals = new Map<string, number>()
  for (const date of dates) {
    const merged = await mergedDayItems(params.siteCode, params, date)
    for (const item of merged.values()) {
      const tag = String(item.categorySubName || item.categoryName || '').trim()
      if (!tag) continue
      let series = countsByTag.get(tag)
      if (!series) {
        series = new Map<string, number>()
        countsByTag.set(tag, series)
      }
      series.set(date, (series.get(date) || 0) + 1)
      totals.set(tag, (totals.get(tag) || 0) + 1)
    }
  }

  const list = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([tag]) => ({
      tag,
      series: dates.map(date => ({ date, count: countsByTag.get(tag)?.get(date) || 0 })),
    }))
  return { data: { startDate: dates[0], endDate: dates[dates.length - 1], days, list } }
}

export const getLocalRankChange = async (params: {
  sourceId: number
  statDate?: string
  compareDate?: string
  topN?: number
}): Promise<{ data: NovelRankChangeResult }> => {
  const doc = params.statDate
    ? await readSnapshot(params.sourceId, params.statDate)
    : await readNewestSnapshot(params.sourceId)
  if (!doc) return { data: { statDate: null, compareDate: null, list: [] } }
  const dates = await listSourceSnapshotDates(params.sourceId)
  const compareDate = params.compareDate || dates.find(date => date < doc.statDate) || null
  const compare = compareDate ? await readSnapshot(params.sourceId, compareDate) : null
  const items = attachCompare(doc.items, compare)
  const list = items
    .map(item => ({
      bookId: item.bookId ?? null,
      bookTitle: item.bookTitle,
      rankNo: item.rankNo,
      rankChange: item.rankChangeDelta ?? item.rankChange ?? 0,
      metricValue: Number(item.metricValue || 0),
      metricText: item.metricText ?? null,
    }))
    .sort((a, b) => Math.abs(b.rankChange) - Math.abs(a.rankChange))
    .slice(0, Math.max(1, Number(params.topN || 10)))
  return { data: { statDate: doc.statDate, compareDate: compare?.statDate || null, list } }
}

export const getLocalRankCompetitor = async (params: {
  siteCode: string
  bookIds: string
  rankType?: string
  gender?: string
  categoryCode?: string
  endDate?: string
  days?: number
}): Promise<{ data: NovelRankCompetitorResult }> => {
  const days = Math.max(2, Math.min(Number(params.days || 14), 60))
  const dates = dateRange(days, params.endDate)
  const wanted = String(params.bookIds || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean)
  const seriesByBook = new Map<string, { bookTitle: string; series: NovelRankCompetitorResult['list'][number]['series'] }>()
  for (const bookId of wanted) seriesByBook.set(bookId, { bookTitle: '', series: [] })
  for (const date of dates) {
    const merged = await mergedDayItems(params.siteCode, params, date)
    const byId = new Map<string, NovelRankItem>()
    for (const item of merged.values()) {
      if (item.bookId) byId.set(item.bookId, item)
    }
    for (const bookId of wanted) {
      const entry = seriesByBook.get(bookId)!
      const item = byId.get(bookId)
      if (item?.bookTitle) entry.bookTitle = item.bookTitle
      entry.series.push({
        date,
        rankNo: item ? item.rankNo : null,
        metricValue: item?.metricValue ?? null,
        metricText: item?.metricText ?? null,
      })
    }
  }
  return {
    data: {
      startDate: dates[0],
      endDate: dates[dates.length - 1],
      days,
      list: wanted.map(bookId => ({
        bookId,
        bookTitle: seriesByBook.get(bookId)!.bookTitle || bookId,
        series: seriesByBook.get(bookId)!.series,
      })),
    },
  }
}

export const getLocalRankAuthorTrend = async (params: {
  siteCode: string
  authorName: string
  rankType?: string
  gender?: string
  categoryCode?: string
  endDate?: string
  days?: number
}): Promise<{ data: NovelRankAuthorTrendResult }> => {
  const days = Math.max(2, Math.min(Number(params.days || 14), 60))
  const dates = dateRange(days, params.endDate)
  const author = String(params.authorName || '').trim()
  const list = [] as NovelRankAuthorTrendResult['list']
  for (const date of dates) {
    const merged = await mergedDayItems(params.siteCode, params, date)
    let bookCount = 0
    let metricSum = 0
    for (const item of merged.values()) {
      if ((item.authorName || '').trim() !== author) continue
      bookCount += 1
      metricSum += Number(item.metricValue || 0)
    }
    list.push({ date, bookCount, metricSum, metricAvg: bookCount ? Math.round(metricSum / bookCount) : 0 })
  }
  return { data: { startDate: dates[0], endDate: dates[dates.length - 1], days, list } }
}

// ---------------------------------------------------------------------------
// 导出（服务端 xlsx → 本机 CSV，Excel 可直接打开）
// ---------------------------------------------------------------------------

const csvEscape = (value: unknown) => {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export const exportLocalRankCsv = async (params: {
  sourceId?: number
  siteCode?: string
  rankType?: string
  gender?: string
  statDate?: string
  compareDate?: string
  categoryCode?: string
  keyword?: string
}) => {
  const items = params.sourceId
    ? (await getLocalRankLatest({ sourceId: params.sourceId, statDate: params.statDate, compareDate: params.compareDate, categoryCode: params.categoryCode, keyword: params.keyword, page: 1, size: 1000 })).data.list
    : params.siteCode
      ? (await getLocalRankLatestAll({ siteCode: params.siteCode, rankType: params.rankType, gender: params.gender, statDate: params.statDate, keyword: params.keyword, page: 1, size: 1000 })).data.list
      : []
  if (!items.length) throw new Error('没有可导出的榜单数据，先抓取一次')
  const header = ['名次', '书名', '作者', '分类', '状态', '指标', '名次变动', '最新章节']
  const rows = items.map(item =>
    [item.rankNo, item.bookTitle, item.authorName || '', item.categoryName || '', item.statusText || '', item.metricText || '', item.rankChangeDelta ?? item.rankChange ?? 0, item.lastChapterTitle || '']
      .map(csvEscape)
      .join(',')
  )
  // BOM 让 Excel 正确识别 UTF-8 中文
  return new Blob(['﻿' + [header.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' })
}
