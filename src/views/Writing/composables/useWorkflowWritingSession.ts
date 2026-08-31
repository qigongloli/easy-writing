import type { JsonRecord } from '@/types/json'
import { computed, onScopeDispose, reactive, readonly, ref, watchEffect, type ComputedRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type {
  WorkflowGenerateBookConflict,
  WorkflowRealtimeEvent,
  WorkflowReviewAction,
  WorkflowReviewFeedback,
  WorkflowRun,
  WorkflowRuntimeEffectiveScope,
  WorkflowRuntimeSettings,
  WorkflowTask,
} from '@/types/workflow'
// 开源版：任务控制与事件流全部走本地引擎（生成在本进程后台跑）
import {
  getLocalWorkflowInfo as getWorkflowInfoApi,
  getLocalWorkflowTaskStatus as getWorkflowTaskStatusApi,
  updateLocalWorkflowRuntimeConfig as updateWorkflowRuntimeConfigApi,
} from '@/storage/local-workflow'
import {
  cancelLocalWorkflowTask as cancelWorkflowTaskApi,
  confirmLocalPlotRewriteOutline as confirmWorkflowPlotRewriteOutlineApi,
  generateLocalWorkflowBook as generateWorkflowBookApi,
  pauseLocalWorkflowTask as pauseWorkflowTaskApi,
  resumeLocalWorkflowTask as resumeWorkflowTaskApi,
  reviewLocalWorkflowTask as reviewWorkflowTaskApi,
} from '@/utils/local-workflow-control'
import { openLocalWorkflowStream as openWorkflowStream } from '@/utils/local-workflow-runtime'

export type WorkflowControlState =
  | 'initializing'
  | 'unavailable'
  | 'generating'
  | 'recovering'
  | 'review_required'
  | 'paused'
  | 'stopped'
  | 'failed'
  | 'done'

export interface WorkflowControlLog {
  time: string
  text: string
}

interface WorkflowReviewPersistResult {
  ok: boolean
  contentVersion?: number
  message?: string
}

interface WorkflowWritingSessionOptions {
  enabled: ComputedRef<boolean>
  runId: ComputedRef<number>
  taskId: ComputedRef<number>
  persistBeforeReview: () => Promise<WorkflowReviewPersistResult>
  normalizeTask?: (incoming: WorkflowTask, current: WorkflowTask | null) => WorkflowTask
  onTaskSynced?: (task: WorkflowTask) => void
  onToken?: (payload: JsonRecord) => void
  onCatalogUpdated?: () => void
  onBeforeStop?: () => void
  onDone?: () => void
  onNewTask?: (task: WorkflowTask) => void
}

const PAUSE_TIMEOUT_MS = 3000
const PAUSE_POLL_INITIAL_MS = 500
const PAUSE_POLL_MAX_MS = 1000

const isWorkflowBookConflict = (value: unknown): value is WorkflowGenerateBookConflict =>
  Boolean(value && typeof value === 'object' && (value as WorkflowGenerateBookConflict).conflict === true)

export type WorkflowContinueAction = 'resume' | 'create'

// 服务端恢复能力是唯一真源；不可恢复的旧任务保留记录，新任务继续写同一本书。
export const resolveWorkflowContinueAction = (
  task: Pick<WorkflowTask, 'canResume'>,
): WorkflowContinueAction =>
  task.canResume === true ? 'resume' : 'create'

interface WorkflowSessionIdentity {
  epoch: number
  runId: number
  taskId: number
}

/** 正文生成任务的进行中状态（与 Writing/index.vue 的 WORKFLOW_CONTENT_BUSY_STATUSES 同语义）。 */
const WORKFLOW_TASK_WRITING_STATUSES = new Set(['queued', 'running'])
/** 可恢复停驻态：任务停在断点，断点章仍是半成品，恢复生成会继续写该章。 */
const WORKFLOW_TASK_RESUMABLE_HALT_STATUSES = new Set(['paused', 'interrupted', 'failed'])
/** 已终结不再推进的任务状态：入口携带这类任务时需要回查 run 上真正的活跃任务。 */
const WORKFLOW_TASK_SETTLED_STATUSES = new Set(['canceled', 'succeeded', 'failed'])
/** 入口任务已终结时可自动接管的活跃任务状态：排队、生成中或等待用户确认。 */
const WORKFLOW_TASK_TAKEOVER_STATUSES = new Set(['queued', 'running', 'review_required'])

/** 服务端正文版本强校验失败时的结构化错误码（见 task_review_resolution.ts）。 */
export const WORKFLOW_CONTENT_VERSION_CONFLICT_CODE = 'WORKFLOW_CONTENT_VERSION_CONFLICT'

/** 从规范化 API 错误中读取版本冲突携带的真实正文版本；非该冲突返回 0。 */
export const readWorkflowConflictVersion = (error: unknown): number => {
  const source = error as { data?: JsonRecord; response?: { data?: { data?: JsonRecord } } } | null
  // 业务错误与 HTTP 409 经过统一规范化后负载都在 error.data；response 兜底旧链路。
  const payload = [source?.data, source?.response?.data?.data].find(
    item => String(item?.errorCode || '') === WORKFLOW_CONTENT_VERSION_CONFLICT_CODE
  )
  return Number(payload?.currentVersion || 0)
}

/**
 * 正文版本冲突自愈：面板与任务快照携带的 contentVersion 在多轮重写后可能落后于
 * 数据库真实版本，服务端 409 会附带 currentVersion。换真实版本自动重试一次即可
 * 恢复，避免把这类内部版本脱节直接变成用户必须手动刷新的错误；重试仍失败说明
 * 存在真实并发修改，错误交回调用方提示用户。
 */
export const retryOnWorkflowVersionConflict = async <T>(
  request: (contentVersion: number) => Promise<T>,
  contentVersion: number,
): Promise<T> => {
  try {
    return await request(contentVersion)
  } catch (error) {
    const currentVersion = readWorkflowConflictVersion(error)
    if (!currentVersion || currentVersion === contentVersion) throw error
    return await request(currentVersion)
  }
}

/** 终态任务仍挂着确认负载（质量确认/剧情章纲）时不自动接管，先让用户完成该决定。 */
const hasPendingReviewPayload = (snapshot: WorkflowTask | null) =>
  Boolean(snapshot?.payload?.qualityReview || snapshot?.payload?.plotOutlineReview)

/** 任务停驻/生成章解析（与 Writing/index.vue 的 resolveWorkflowTaskChapterId 同源语义）。 */
export const resolveWorkflowSessionTaskChapterId = (task?: WorkflowTask | null) =>
  Number(
    task?.currentChapterId ||
      task?.payload?.chapterId ||
      task?.payload?.qualityReview?.chapterId ||
      task?.payload?.qualitySuggestions?.chapterId ||
      0
  )

/**
 * 工作流写作会话的跨组件快照（批次三 3A）。
 *
 * Writing/index.vue 持有唯一会话实例；编辑器、重写面板等深层组件不再经由
 * 层层 props 透传，而是只读这份模块级快照来判断「工作流当前是否允许人工改稿」。
 * 快照由会话实例的 watchEffect 维护，会话所在组件卸载时自动复位。
 */
export interface WorkflowWritingSessionSnapshot {
  /** 自动生文会话是否启用（工作流身份已通过校验并建立会话） */
  enabled: boolean
  taskId: number
  /** 任务原始状态；空串表示任务快照未就绪 */
  taskStatus: string
  controlState: WorkflowControlState
  /** 任务当前停驻章（生成中或断点半成品章），无任务时为 0 */
  taskChapterId: number
}

const sharedSessionSnapshot = reactive<WorkflowWritingSessionSnapshot>({
  enabled: false,
  taskId: 0,
  taskStatus: '',
  controlState: 'initializing',
  taskChapterId: 0,
})

const resetSharedSessionSnapshot = () => {
  sharedSessionSnapshot.enabled = false
  sharedSessionSnapshot.taskId = 0
  sharedSessionSnapshot.taskStatus = ''
  sharedSessionSnapshot.controlState = 'initializing'
  sharedSessionSnapshot.taskChapterId = 0
}

/** 只读的工作流写作会话快照；无会话时为复位后的初始值。 */
export const useWorkflowWritingSessionSnapshot = () => readonly(sharedSessionSnapshot)

/**
 * 工作流模式下指定章节是否允许人工改稿（气泡菜单、AI 润色、单章重写等主动编辑入口）。
 *
 * 解禁判定（批次三 3A 用户意见回流）：
 * - 任务停机等确认（review_required）：整书可改，待确认章就是要让用户改的章；
 * - 无进行中生成任务（状态不在 queued/running）：已完成章节可改；
 *   仅可恢复停驻态（paused/interrupted/failed）下的断点半成品章保持锁定，
 *   避免人工改稿与断点续写互相覆盖（canceled/succeeded 表示任务终结，全书解禁）。
 * - 会话未启用或任务快照未就绪：保守禁用，避免状态未知时误放行。
 */
export const isWorkflowChapterManualEditable = (chapterId?: number | null): boolean => {
  if (!sharedSessionSnapshot.enabled) return false
  const status = sharedSessionSnapshot.taskStatus
  if (!status) return false
  if (status === 'review_required') return true
  if (WORKFLOW_TASK_WRITING_STATUSES.has(status)) return false
  if (
    WORKFLOW_TASK_RESUMABLE_HALT_STATUSES.has(status) &&
    Number(chapterId || 0) !== 0 &&
    Number(chapterId || 0) === sharedSessionSnapshot.taskChapterId
  ) {
    return false
  }
  return true
}

export const useWorkflowWritingSession = (options: WorkflowWritingSessionOptions) => {
  const route = useRoute()
  const router = useRouter()
  const task = ref<WorkflowTask | null>(null)
  const run = ref<WorkflowRun | null>(null)
  const actionPending = ref(false)
  const configUpdating = ref(false)
  const recovering = ref(false)
  // 首次任务快照到达前区分连接中与不可用，避免空任务被当作生成中。
  const taskSyncState = ref<'initializing' | 'ready' | 'unavailable'>('initializing')
  const logs = ref<WorkflowControlLog[]>([])
  const requestedAction = ref<'pause' | 'cancel' | ''>('')
  const writingScene = ref(0)
  const stageText = ref('')
  let statusTimer: ReturnType<typeof setInterval> | null = null
  let closeStream: (() => void) | null = null
  let sessionEpoch = 0
  let actionRequestToken = 0
  let configRequestToken = 0
  let lastCatalogChapterKey = ''

  const captureSessionIdentity = (): WorkflowSessionIdentity => ({
    epoch: sessionEpoch,
    runId: Number(options.runId.value || 0),
    taskId: Number(options.taskId.value || 0),
  })

  // 会话代次与运行、任务标识必须同时一致，旧请求才不会覆盖路由切换后的新会话。
  const isCurrentSession = (identity: WorkflowSessionIdentity) =>
    identity.epoch === sessionEpoch &&
    identity.runId === Number(options.runId.value || 0) &&
    identity.taskId === Number(options.taskId.value || 0)

  const isCurrentActionRequest = (identity: WorkflowSessionIdentity, requestToken: number) =>
    isCurrentSession(identity) && requestToken === actionRequestToken

  const isCurrentConfigRequest = (identity: WorkflowSessionIdentity, requestToken: number) =>
    isCurrentSession(identity) && requestToken === configRequestToken

  // 新会话统一失效旧异步请求并清理操作锁，旧请求的 finally 不得影响新会话。
  const advanceSession = () => {
    sessionEpoch += 1
    actionRequestToken += 1
    configRequestToken += 1
    actionPending.value = false
    configUpdating.value = false
  }

  const controlState = computed<WorkflowControlState>(() => {
    if (!task.value) {
      return taskSyncState.value === 'unavailable' ? 'unavailable' : 'initializing'
    }
    const status = task.value?.status
    if (status === 'review_required') return 'review_required'
    if (recovering.value) return 'recovering'
    if (status === 'paused') return 'paused'
    if (status === 'canceled') return 'stopped'
    if (['failed', 'interrupted'].includes(String(status || ''))) return 'failed'
    if (status === 'succeeded') return 'done'
    return 'generating'
  })

  const controlPending = computed(() =>
    actionPending.value ||
    ['pause', 'cancel'].includes(String(task.value?.requestedAction || ''))
  )

  // 维护跨组件共享快照：编辑器与重写面板据此判定人工改稿解禁，见文件头部说明。
  watchEffect(() => {
    sharedSessionSnapshot.enabled = options.enabled.value === true
    sharedSessionSnapshot.taskId = Number(task.value?.id || 0)
    sharedSessionSnapshot.taskStatus = String(task.value?.status || '')
    sharedSessionSnapshot.controlState = controlState.value
    sharedSessionSnapshot.taskChapterId = resolveWorkflowSessionTaskChapterId(task.value)
  })
  // 会话宿主组件卸载后快照必须复位，避免旧会话状态泄漏到下一次进入。
  onScopeDispose(resetSharedSessionSnapshot)

  const appendLog = (text: string) => {
    logs.value = [
      ...logs.value.slice(-7),
      {
        time: new Date().toLocaleTimeString('zh-CN', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        text,
      },
    ]
  }

  const syncCatalogForTaskChapter = (snapshot: WorkflowTask | null) => {
    const chapterId = Number(snapshot?.currentChapterId || 0)
    const chapterTitle = String(snapshot?.currentChapterTitle || '').trim()
    if (!chapterId || !chapterTitle) return
    const chapterKey = `${Number(snapshot?.id || 0)}:${chapterId}:${chapterTitle}`
    if (chapterKey === lastCatalogChapterKey) return
    lastCatalogChapterKey = chapterKey
    // 章纲事件可能发生在 SSE 重连前，任务快照变化必须补刷整批目录标题。
    options.onCatalogUpdated?.()
  }

  const applyTaskSnapshot = (incoming: WorkflowTask) => {
    // 新旧任务之间不能复用可视快照，避免归一化逻辑保留上一任务的标识和进度。
    const current = task.value?.id === incoming.id ? task.value : null
    const syncedTask = options.normalizeTask?.(incoming, current) || incoming
    const leftActiveState =
      ['queued', 'running'].includes(String(current?.status || ''))
      && !['queued', 'running'].includes(String(syncedTask.status || ''))
    task.value = syncedTask
    taskSyncState.value = 'ready'
    syncCatalogForTaskChapter(syncedTask)
    // 任务离开生成态时只刷新一次目录，让停止后的半成品章节及时退出“生成中”。
    if (leftActiveState) options.onCatalogUpdated?.()
    options.onTaskSynced?.(syncedTask)
    return syncedTask
  }

  const stopPolling = () => {
    if (!statusTimer) return
    clearInterval(statusTimer)
    statusTimer = null
  }

  const stop = () => {
    stopPolling()
    closeStream?.()
    closeStream = null
  }

  const syncRun = async (identity = captureSessionIdentity()) => {
    if (!identity.runId || !isCurrentSession(identity)) return
    try {
      const { data } = await getWorkflowInfoApi(identity.runId)
      if (!isCurrentSession(identity) || Number(data.id) !== identity.runId) return
      run.value = data
    } catch {
      // 模型信息同步失败不影响正文任务，重连时会继续补齐。
    }
  }

  const syncTask = async (silent = false, identity = captureSessionIdentity()) => {
    if (!options.enabled.value || !identity.taskId || !isCurrentSession(identity)) return
    try {
      const { data } = await getWorkflowTaskStatusApi(identity.taskId)
      if (!isCurrentSession(identity) || Number(data.id) !== identity.taskId) return
      const syncedTask = applyTaskSnapshot(data)
      if (
        data.payload?.batchConfigApplied === true &&
        run.value?.config?.pendingRuntimeConfig
      ) {
        void syncRun(identity)
      }
      if (syncedTask.status !== 'running') recovering.value = false
      if (['paused', 'interrupted', 'failed', 'canceled', 'succeeded'].includes(syncedTask.status)) {
        requestedAction.value = ''
      }
      if (['succeeded', 'interrupted', 'failed', 'canceled'].includes(syncedTask.status)) {
        stop()
      } else if (syncedTask.status === 'paused' || syncedTask.status === 'review_required') {
        stopPolling()
      }
    } catch {
      if (!isCurrentSession(identity)) return
      if (!task.value) taskSyncState.value = 'unavailable'
      if (!silent) ElMessage.error('获取自动生文状态失败')
    }
  }

  const handleRealtimeEvent = (
    event: WorkflowRealtimeEvent,
    identity: WorkflowSessionIdentity,
  ) => {
    if (
      !isCurrentSession(identity) ||
      !event ||
      Number(event.taskId || 0) !== identity.taskId
    ) return
    const payload = event.payload || {}
    if (event.type === 'recovering') {
      recovering.value = true
      appendLog(String(payload.message || '生成通道正在自动恢复'))
      return
    }
    if (event.type === 'quality-review') {
      recovering.value = false
      appendLog('本章正文已保存，等待确认质量建议')
      void syncTask(true, identity)
      options.onCatalogUpdated?.()
      return
    }
    if (event.type === 'review-resolved') {
      recovering.value = false
      appendLog(String(payload.message || '质量建议已处理，继续生成'))
      void syncTask(true, identity)
      return
    }
    if (event.type === 'stage') {
      recovering.value = false
      const message = String(payload.message || '')
      if (message) {
        stageText.value = message
        appendLog(message)
      }
      if (payload.catalogUpdated) options.onCatalogUpdated?.()
      return
    }
    if (event.type === 'scene-start') {
      writingScene.value = Number(payload.sceneNo || 0)
      stageText.value = ''
      return
    }
    if (event.type === 'token') {
      recovering.value = false
      writingScene.value = 0
      stageText.value = ''
      if (task.value) {
        task.value = {
          ...task.value,
          currentChapterId: Number(payload.chapterId || task.value.currentChapterId || 0),
          currentChapterTitle: String(payload.chapterTitle || task.value.currentChapterTitle || ''),
          chapterNo: Number(payload.chapterNo || task.value.chapterNo || 0),
          sceneNo: Number(payload.sceneNo || task.value.sceneNo || 0),
          progress: Number(payload.progress || task.value.progress || 0),
          generatedWords: Number(payload.wordCount || payload.generatedWords || task.value.generatedWords || 0),
          totalGeneratedWords: Number(payload.totalGeneratedWords || task.value.totalGeneratedWords || 0),
        }
        syncCatalogForTaskChapter(task.value)
      }
      options.onToken?.(payload)
      return
    }
    if (event.type === 'scene-done') {
      writingScene.value = 0
      appendLog(`完成第 ${Number(payload.sceneNo || 0)} 场，进度 ${Math.round(Number(payload.progress || 0))}%`)
      return
    }
    if (event.type === 'progress') {
      void syncTask(true, identity)
      return
    }
    if (event.type === 'paused') {
      stageText.value = ''
      appendLog('任务已暂停，当前正文和断点已保存')
      void syncTask(true, identity)
      return
    }
    if (event.type === 'done') {
      recovering.value = false
      stageText.value = ''
      const remaining = Number(payload.remainingChapters || 0)
      appendLog(remaining > 0 ? `仍有 ${remaining} 章未完成，可继续生成` : '全书自动生文已完成')
      void syncTask(true, identity)
      options.onCatalogUpdated?.()
      options.onDone?.()
      return
    }
    if (event.type === 'error') {
      recovering.value = false
      stageText.value = ''
      appendLog(String(payload.message || '自动生文任务失败'))
      void syncTask(true, identity)
    }
  }

  /**
   * 入口任务已终结时接管 run 上真正的活跃任务。
   *
   * 历史卡片或旧路由可能携带已取消/已结束的任务进入写作页；此时 run.activeTaskId
   * 指向的才是需要处理的任务（典型场景：取消整本生成后发起的单章重写停在待确认）。
   * 若停在终态任务上不回查，工作流面板对用户就是一潭死水，只能退回普通编辑。
   * 接管走改写路由而不是在旧会话内偷换任务：路由中的 taskId 是会话唯一键，
   * 改路由会触发页面重新校验归属并重建实时会话，不绕过入口校验。
   */
  const recoverStaleEntryTask = async (identity: WorkflowSessionIdentity) => {
    const snapshot = task.value
    if (
      !isCurrentSession(identity) ||
      Number(snapshot?.id || 0) !== identity.taskId ||
      !WORKFLOW_TASK_SETTLED_STATUSES.has(String(snapshot?.status || '')) ||
      hasPendingReviewPayload(snapshot)
    ) return
    // 运行详情已由 start() 的 syncRun 拉取；activeTask 来自 run.activeTaskId。
    const runDetail = run.value
    if (Number(runDetail?.id || 0) !== identity.runId) return
    const activeTask = runDetail?.activeTask
    const activeTaskId = Number(activeTask?.id || 0)
    if (
      !activeTaskId ||
      activeTaskId === identity.taskId ||
      !WORKFLOW_TASK_TAKEOVER_STATUSES.has(String(activeTask?.status || ''))
    ) return
    appendLog('检测到本书仍有进行中的生成任务，正在接管')
    await router.replace({
      path: route.path,
      query: {
        ...route.query,
        from: 'workflow',
        runId: String(identity.runId),
        taskId: String(activeTaskId),
      },
    })
  }

  const start = () => {
    stop()
    advanceSession()
    const identity = captureSessionIdentity()
    if (!options.enabled.value || !identity.runId || !identity.taskId) return
    appendLog('已连接自动生文任务')
    void Promise.all([syncRun(identity), syncTask(false, identity)]).then(() =>
      recoverStaleEntryTask(identity).catch(() => {
        // 接管失败保持当前终态展示，用户仍可从历史页重新进入。
      })
    )
    statusTimer = setInterval(() => void syncTask(true, identity), 5000)
    let streamDown = false
    closeStream = openWorkflowStream(identity.runId, {
      onEvent: event => handleRealtimeEvent(event, identity),
      onStateChange: state => {
        if (!isCurrentSession(identity)) return
        if (state !== 'reconnecting' || streamDown) return
        streamDown = true
        appendLog('网络连接不稳定，正在恢复，已生成内容不会丢失')
      },
      onReconnect: () => {
        if (!isCurrentSession(identity)) return
        streamDown = false
        appendLog('连接已恢复，生成进度已同步')
        // 目录变更事件不持久化，重连后主动补刷才能覆盖断线期间生成的整批章名。
        options.onCatalogUpdated?.()
        void syncTask(true, identity)
      },
    })
  }

  const waitForPause = async (identity: WorkflowSessionIdentity) => {
    const startedAt = Date.now()
    let pollDelay = PAUSE_POLL_INITIAL_MS
    while (Date.now() - startedAt < PAUSE_TIMEOUT_MS) {
      // 暂停确认采用低频退避，给服务端保存断点留出时间并避免短时密集请求。
      await new Promise(resolve => window.setTimeout(resolve, pollDelay))
      if (!isCurrentSession(identity)) return false
      if (Date.now() - startedAt >= PAUSE_TIMEOUT_MS) break
      const { data } = await getWorkflowTaskStatusApi(identity.taskId)
      if (!isCurrentSession(identity) || Number(data.id) !== identity.taskId) return false
      const syncedTask = applyTaskSnapshot(data)
      if (!['running', 'queued'].includes(syncedTask.status)) {
        requestedAction.value = ''
        return true
      }
      pollDelay = Math.min(PAUSE_POLL_MAX_MS, Math.round(pollDelay * 1.5))
    }
    return false
  }

  const pause = async (pauseOptions: { silent?: boolean } = {}) => {
    const identity = captureSessionIdentity()
    if (!identity.taskId || task.value?.id !== identity.taskId) return false
    if (task.value?.status === 'paused') return true
    if (actionPending.value) {
      return requestedAction.value === 'pause' ? await waitForPause(identity) : false
    }
    const requestToken = ++actionRequestToken
    requestedAction.value = 'pause'
    if (task.value) task.value = { ...task.value, requestedAction: 'pause' }
    appendLog('正在暂停当前生成并保存断点')
    actionPending.value = true
    try {
      const { data } = await pauseWorkflowTaskApi({ taskId: identity.taskId })
      if (!isCurrentActionRequest(identity, requestToken) || Number(data.id) !== identity.taskId) {
        return false
      }
      const syncedTask = applyTaskSnapshot(data)
      const paused = ['paused', 'succeeded', 'canceled', 'failed'].includes(syncedTask.status)
        ? true
        : await waitForPause(identity)
      if (!paused) {
        if (!pauseOptions.silent) ElMessage.error('暂停未在预期时间内完成，请重试')
        return false
      }
      requestedAction.value = ''
      appendLog('已暂停，当前正文和断点已保存')
      return true
    } catch {
      if (!isCurrentActionRequest(identity, requestToken)) return false
      requestedAction.value = ''
      ElMessage.error('暂停自动生文失败')
      return false
    } finally {
      if (isCurrentActionRequest(identity, requestToken)) actionPending.value = false
    }
  }

  const resume = async () => {
    const identity = captureSessionIdentity()
    if (!identity.taskId || task.value?.id !== identity.taskId || actionPending.value) return
    const requestToken = ++actionRequestToken
    actionPending.value = true
    try {
      const { data } = await resumeWorkflowTaskApi({ taskId: identity.taskId })
      if (!isCurrentActionRequest(identity, requestToken) || Number(data.id) !== identity.taskId) {
        return
      }
      applyTaskSnapshot(data)
      requestedAction.value = ''
      appendLog('已恢复自动生文')
      start()
    } catch {
      if (!isCurrentActionRequest(identity, requestToken)) return
      ElMessage.error('恢复自动生文失败')
    } finally {
      if (isCurrentActionRequest(identity, requestToken)) actionPending.value = false
    }
  }

  const retry = async (
    successLog = '已重新提交自动生文任务',
    errorMessage = '重新生成失败',
  ) => {
    if (!options.runId.value || actionPending.value) return
    stop()
    advanceSession()
    const identity = captureSessionIdentity()
    const requestToken = ++actionRequestToken
    actionPending.value = true
    try {
      const { data } = await generateWorkflowBookApi({ runId: identity.runId })
      if (!isCurrentActionRequest(identity, requestToken)) return
      if (isWorkflowBookConflict(data)) {
        ElMessage.warning(data.message || '当前有自动生文任务正在运行')
        void router.push({
          path: '/workflowBook/history',
          query: { status: 'running', taskId: String(data.activeTask?.id || '') },
        })
        return
      }
      if (Number(data.runId) !== identity.runId) return
      if (!data.bookId) throw new Error('工作流未返回书籍ID')
      const syncedTask = applyTaskSnapshot(data)
      requestedAction.value = ''
      logs.value = []
      appendLog(successLog)
      options.onNewTask?.(syncedTask)
      await router.replace({
        path: `/writing/${syncedTask.bookId}`,
        query: {
          ...route.query,
          from: 'workflow',
          runId: String(syncedTask.runId || identity.runId),
          taskId: String(syncedTask.id),
        },
      })
      // 路由中的 taskId 是会话唯一键，由页面监听器统一建立一次实时连接。
    } catch (error) {
      if (!isCurrentActionRequest(identity, requestToken)) return
      ElMessage.error(String(error?.message || errorMessage))
    } finally {
      if (isCurrentActionRequest(identity, requestToken)) actionPending.value = false
    }
  }

  const continueGeneration = async () => {
    if (!task.value) return
    if (resolveWorkflowContinueAction(task.value) === 'create') {
      await retry('已继续自动生文', '继续生成失败')
      return
    }
    await resume()
  }

  const review = async (action: WorkflowReviewAction, feedback?: WorkflowReviewFeedback) => {
    const identity = captureSessionIdentity()
    if (!identity.taskId || task.value?.id !== identity.taskId || actionPending.value) return
    const qualityReview = task.value?.payload?.qualityReview
    if (!qualityReview) return
    const persisted = await options.persistBeforeReview()
    if (!isCurrentSession(identity) || actionPending.value) return
    if (!persisted.ok) {
      ElMessage.error(
        persisted.message || '当前正文保存失败，请检查网络后重试'
      )
      return
    }
    const requestToken = ++actionRequestToken
    actionPending.value = true
    try {
      const contentVersion = Number(persisted.contentVersion || 0)
      if (!contentVersion) {
        ElMessage.error('无法确认当前正文版本，请重新保存后再试')
        return
      }
      // 用户意见只随重写回传：接受本章不需要携带补充要求。
      const feedbackText = action === 'rewrite' ? String(feedback?.feedback || '').trim() : ''
      const feedbackToRules = Boolean(feedbackText) && feedback?.feedbackToRules === true
      const rewriteMode =
        action === 'rewrite' && feedback?.rewriteMode === 'plot' ? 'plot' : 'content'
      const { data } = await reviewWorkflowTaskApi({
        taskId: identity.taskId,
        action,
        // 接受操作只确认编辑器刚保存成功的精确版本。
        contentVersion,
        ...(feedbackText ? { feedback: feedbackText } : {}),
        ...(feedbackToRules ? { feedbackToRules: true } : {}),
        ...(action === 'rewrite' ? { rewriteMode } : {}),
      })
      if (!isCurrentActionRequest(identity, requestToken) || Number(data.id) !== identity.taskId) {
        return
      }
      applyTaskSnapshot(data)
      appendLog(
        action === 'accept'
          ? '已接受本章，继续生成'
          : feedbackText
            ? '已按补充要求重新生成本章'
            : '已保留当前版本并重新生成本章'
      )
      start()
      options.onCatalogUpdated?.()
    } catch (error) {
      if (!isCurrentActionRequest(identity, requestToken)) return
      ElMessage.error(String(error?.message || (action === 'accept' ? '继续生成失败' : '重新生成失败')))
    } finally {
      if (isCurrentActionRequest(identity, requestToken)) actionPending.value = false
    }
  }

  const reviewPlotOutline = async (action: 'accept' | 'discard') => {
    const identity = captureSessionIdentity()
    if (
      !identity.taskId ||
      task.value?.id !== identity.taskId ||
      actionPending.value ||
      !task.value?.payload?.plotOutlineReview
    ) return
    const requestToken = ++actionRequestToken
    actionPending.value = true
    try {
      const { data } = await confirmWorkflowPlotRewriteOutlineApi({
        taskId: identity.taskId,
        action,
        ...(action === 'discard'
          ? {
              contentVersion: Number(
                task.value.payload.plotOutlineReview.contentVersion || 0
              ),
            }
          : {}),
      })
      if (
        !isCurrentActionRequest(identity, requestToken) ||
        Number(data.id) !== identity.taskId
      ) return
      applyTaskSnapshot(data)
      appendLog(
        action === 'accept'
          ? '已确认新章纲，开始生成正文'
          : '已丢弃新章纲，恢复原章纲与原正文'
      )
      if (action === 'accept') start()
      options.onCatalogUpdated?.()
    } catch (error) {
      if (!isCurrentActionRequest(identity, requestToken)) return
      ElMessage.error(
        String(error?.message || (action === 'accept' ? '确认新章纲失败' : '丢弃新章纲失败'))
      )
    } finally {
      if (isCurrentActionRequest(identity, requestToken)) actionPending.value = false
    }
  }

  const updateRuntimeConfig = async (payload: {
    modelCode?: string
    config: Partial<WorkflowRuntimeSettings>
    effectiveScope: WorkflowRuntimeEffectiveScope
  }) => {
    const identity = captureSessionIdentity()
    if (!identity.runId || configUpdating.value) return
    const requestToken = ++configRequestToken
    configUpdating.value = true
    try {
      const { data } = await updateWorkflowRuntimeConfigApi({
        runId: identity.runId,
        ...(payload.modelCode !== undefined ? { modelCode: payload.modelCode } : {}),
        config: payload.config,
        effectiveScope: payload.effectiveScope,
      })
      if (
        !isCurrentConfigRequest(identity, requestToken) ||
        Number(data.run.id) !== identity.runId
      ) return
      run.value = data.run
      appendLog(payload.effectiveScope === 'next_chapter'
        ? '创作设定将在下一章生效'
        : '创作设定将从后续章节开始生效')
      ElMessage.success('创作设定已保存')
    } catch (error) {
      if (!isCurrentConfigRequest(identity, requestToken)) return
      ElMessage.error(String(error?.message || '创作设定保存失败'))
    } finally {
      if (isCurrentConfigRequest(identity, requestToken)) configUpdating.value = false
    }
  }

  const cancel = async () => {
    const identity = captureSessionIdentity()
    if (!identity.taskId || task.value?.id !== identity.taskId || actionPending.value) return
    const requestToken = ++actionRequestToken
    requestedAction.value = 'cancel'
    if (task.value) task.value = { ...task.value, requestedAction: 'cancel' }
    options.onBeforeStop?.()
    appendLog('正在停止自动生成并保留已生成正文')
    actionPending.value = true
    try {
      const { data } = await cancelWorkflowTaskApi({ taskId: identity.taskId })
      if (!isCurrentActionRequest(identity, requestToken) || Number(data.id) !== identity.taskId) {
        return
      }
      const syncedTask = applyTaskSnapshot(data)
      if (!['running', 'queued'].includes(syncedTask.status)) requestedAction.value = ''
      appendLog(syncedTask.status === 'canceled' ? '自动生成已停止，正文已保留' : '已请求停止自动生成')
      if (syncedTask.status === 'canceled') stop()
    } catch {
      if (!isCurrentActionRequest(identity, requestToken)) return
      requestedAction.value = ''
      if (task.value) task.value = { ...task.value, requestedAction: null }
      ElMessage.error('停止自动生成失败')
    } finally {
      if (isCurrentActionRequest(identity, requestToken)) actionPending.value = false
    }
  }

  const reset = () => {
    advanceSession()
    stop()
    task.value = null
    run.value = null
    logs.value = []
    requestedAction.value = ''
    recovering.value = false
    taskSyncState.value = 'initializing'
    writingScene.value = 0
    stageText.value = ''
    lastCatalogChapterKey = ''
  }

  return {
    task,
    run,
    actionPending,
    configUpdating,
    logs,
    writingScene,
    stageText,
    controlState,
    controlPending,
    appendLog,
    start,
    stop,
    reset,
    syncTask,
    pause,
    continueGeneration,
    review,
    reviewPlotOutline,
    updateRuntimeConfig,
    cancel,
  }
}
