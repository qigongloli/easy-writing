import type { JsonRecord } from '@/types/json'
import type {
  WorkflowAvailableAction,
  WorkflowDisplayStatus,
  WorkflowHistoryPageResult,
  WorkflowHistoryQuery,
  WorkflowHistoryRecord,
  WorkflowTask,
} from '@/types/workflow'
import {
  listLocalWorkflowRuns,
  readRepairedLocalTask,
  STEP_TITLES,
  type LocalWorkflowRun,
} from './local-workflow'

/**
 * 工作流历史页的本地数据装配：把 run + 最近任务翻译成展示状态与可用操作。
 * 状态谱系与服务端一致：draft / generating / paused / attention / completed / canceled，
 * 操作按状态给（生成中可暂停停止、断点态可继续、待确认进书处理）。
 */

const resolveDisplayStatus = (
  run: LocalWorkflowRun,
  task: WorkflowTask | null
): WorkflowDisplayStatus => {
  const status = String(task?.status || '')
  if (['queued', 'running'].includes(status)) return 'generating'
  if (status === 'paused') return 'paused'
  if (['review_required', 'interrupted', 'failed'].includes(status)) return 'attention'
  if (status === 'canceled') return 'canceled'
  if (run.bookId) return 'completed'
  return 'draft'
}

const resolveActions = (
  run: LocalWorkflowRun,
  display: WorkflowDisplayStatus,
  task: WorkflowTask | null
): WorkflowAvailableAction[] => {
  if (display === 'generating') return ['openBook', 'pause', 'cancel']
  if (display === 'paused') return ['openBook', 'resume', 'cancel']
  if (display === 'attention') {
    return String(task?.status) === 'review_required'
      ? ['openBook', 'review', 'cancel']
      : ['openBook', 'resume', 'cancel']
  }
  if (run.bookId) return ['openBook', 'delete']
  return ['editSettings', 'delete']
}

export const getLocalWorkflowHistory = async (params?: WorkflowHistoryQuery) => {
  const keyword = String(params?.keyword || '').trim().toLowerCase()
  const runs = (await listLocalWorkflowRuns()).filter(run =>
    !keyword || String(run.title || '').toLowerCase().includes(keyword)
  )
  const page = Math.max(1, Number(params?.page || 1))
  const size = Math.max(1, Number(params?.size || 20))

  const records: WorkflowHistoryRecord[] = []
  const filtered: Array<{ run: LocalWorkflowRun; record: WorkflowHistoryRecord }> = []

  for (const run of runs) {
    const bookTask = run.latestBookTaskId
      ? await readRepairedLocalTask(Number(run.latestBookTaskId))
      : null
    const stepTaskRaw = !bookTask && run.latestStepTaskId
      ? await readRepairedLocalTask(Number(run.latestStepTaskId))
      : null
    const display = resolveDisplayStatus(run, bookTask)
    const record: WorkflowHistoryRecord = {
      runId: Number(run.id),
      title: run.title || '未命名工作流',
      status: run.status,
      displayStatus: display,
      availableActions: resolveActions(run, display, bookTask),
      currentStep: STEP_TITLES[run.currentStep] || run.currentStep,
      modelCode: run.modelCode,
      bookId: run.bookId ?? null,
      activeTask: bookTask,
      stepTask: stepTaskRaw
        ? {
            id: Number(stepTaskRaw.id),
            step: String((stepTaskRaw.payload as JsonRecord | undefined)?.step || ''),
            status: String(stepTaskRaw.status || ''),
            requestedAction: stepTaskRaw.requestedAction ?? null,
            errorMessage: stepTaskRaw.errorMessage ?? null,
          }
        : null,
      progress: Math.round(Number(bookTask?.progress || 0)),
      generatedWords: Number(bookTask?.totalGeneratedWords || 0),
      totalChapters: Number(bookTask?.totalChapters || 0),
      finishedChapters: Number(bookTask?.finishedChapters || 0),
      chapterPlanningMode: bookTask?.chapterPlanningMode,
      errorMessage: String(bookTask?.errorMessage || ''),
      createTime: run.createTime,
      updateTime: run.updateTime,
    }
    filtered.push({ run, record })
  }

  const countBy = (status: WorkflowDisplayStatus) =>
    filtered.filter(item => item.record.displayStatus === status).length
  const stats = {
    all: filtered.length,
    generating: countBy('generating'),
    paused: countBy('paused'),
    attention: countBy('attention'),
    completed: countBy('completed'),
    canceled: countBy('canceled'),
  }

  // 旧入口会带 status=running 跳过来（冲突提示），与展示态 generating 同义
  const statusFilter = String(params?.status || '').trim().replace(/^running$/, 'generating')
  const visible = statusFilter && statusFilter !== 'all'
    ? filtered.filter(item => item.record.displayStatus === statusFilter)
    : filtered
  visible.slice((page - 1) * size, page * size).forEach(item => records.push(item.record))

  const result: WorkflowHistoryPageResult = {
    list: records,
    pagination: { page, size, total: visible.length },
    stats,
  }
  return { data: result }
}
