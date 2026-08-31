import { computed, nextTick, onBeforeUnmount, reactive, ref, watch, type Ref } from 'vue'
import type { Editor } from '@tiptap/vue-3'
import { ElMessage } from 'element-plus'
import {
  issueHighlightPluginKey,
  type IssueHighlightItem,
} from '../extends/IssueHighlightExtension'

interface IssuePolishOptions {
  editor: Ref<Editor | undefined>
  /** 父级按当前章过滤后的审稿建议标注 */
  issueHighlights: () => IssueHighlightItem[] | undefined
  /** 正文里选中/取消选中命中段（右侧卡片联动加边框） */
  onIssueSelected: (issueKeys: string[]) => void
  /** 某条建议的段落已被 AI 改写替换（卡片打「已修改」标） */
  onIssuePolished: (issueKey: string) => void
}

/**
 * 审稿建议正文标注 + AI 局部修改预览（脱离文档流的悬浮面板）。
 * 覆盖：标注挂载/定位轮巡/点击选中、预览卡定位跟随、AI 改写请求与原子替换、
 * 手动改动即作废预览。逻辑自 WritingEditor 原样搬迁，行为不变。
 */
export const useIssuePolish = (options: IssuePolishOptions) => {
  const { editor, issueHighlights, onIssueSelected, onIssuePolished } = options

  const applyIssueHighlights = () => {
    if (!editor.value) return
    const items = issueHighlights() || []
    if (items.length) {
      editor.value.commands.setIssueHighlights(items)
    } else {
      editor.value.commands.clearIssueHighlights()
    }
  }

  const compactIssueText = (value: string) => String(value || '').replace(/\s+/g, '')

  // 同一条建议命中多段时，重复点"定位原文/AI 修改此段"在命中段之间轮巡
  const issueLocateCycle = new Map<string, number>()

  /** 建议命中的全部段落装饰（按文档顺序）；skipEdited=true 跳过已修改的灰态段 */
  const resolveIssueTargets = (issueKey: string, skipEdited = false) => {
    const view = editor.value?.view
    if (!view || !issueKey) return []
    const state = issueHighlightPluginKey.getState(view.state)
    return (state?.deco.find() || [])
      .filter(decoration => {
        const spec = decoration.spec as {
          issueKeys?: string[]
          edited?: boolean
        }
        if (skipEdited && spec.edited) return false
        return (
          Array.isArray(spec.issueKeys) && spec.issueKeys.includes(issueKey)
        )
      })
      .sort((left, right) => left.from - right.from)
  }

  /** 文档顶层块下标（pos 必须是块起始位置，即段落装饰的 from） */
  const blockIndexAtPos = (pos: number) => {
    const doc = editor.value?.state.doc
    if (!doc) return -1
    let offset = 0
    for (let index = 0; index < doc.childCount; index += 1) {
      if (offset === pos) return index
      offset += doc.child(index).nodeSize
      if (offset > pos) return -1
    }
    return -1
  }

  const scrollFlashIssueTarget = (from: number) => {
    const view = editor.value?.view
    const dom = view?.nodeDOM(from) as HTMLElement | null
    if (!dom) return false
    dom.scrollIntoView({ behavior: 'smooth', block: 'center' })
    dom.classList.add('issue-flash')
    window.setTimeout(() => dom.classList.remove('issue-flash'), 1600)
    return true
  }

  const locateIssueHighlight = (issueKey: string): boolean => {
    const hits = resolveIssueTargets(issueKey)
    if (!hits.length) return false
    const cycle = issueLocateCycle.get(issueKey) || 0
    issueLocateCycle.set(issueKey, cycle + 1)
    return scrollFlashIssueTarget(hits[cycle % hits.length].from)
  }

  // ===== 审稿建议：选中态 + AI 局部修改预览（脱离文档流的悬浮面板） =====

  interface IssuePolishRequestArgs {
    paragraphText: string
    prevParagraph?: string
    nextParagraph?: string
    extraRequirement?: string
  }

  interface IssuePolishSession {
    issueKey: string
    label: string
    quotes: string[]
    original: string
    polished: string
    loading: boolean
    error: string
    extraOpen: boolean
    extraText: string
    /** ‹ › 显式导航：命中处总数与当前序号（跳过已修改段） */
    navTotal: number
    navCurrent: number
    request: (args: IssuePolishRequestArgs) => Promise<string>
  }

  const polishSession = ref<IssuePolishSession | null>(null)
  let polishApplying = false

  /** 悬浮面板定位样式（fixed，脱离文档流，跟随选中段） */
  const polishCardStyle = ref<Record<string, string>>({})
  const polishCardRef = ref<HTMLElement | null>(null)

  /** 当前选中段（依赖装饰的 active 标记，位置随编辑自动位移） */
  const getActivePolishTarget = () => {
    const view = editor.value?.view
    if (!view) return null
    const state = issueHighlightPluginKey.getState(view.state)
    const active = (state?.deco.find() || []).find(
      decoration => (decoration.spec as { active?: boolean })?.active,
    )
    if (!active) return null
    const node = view.state.doc.nodeAt(active.from)
    if (!node) return null
    return { from: active.from, node, blockIndex: blockIndexAtPos(active.from) }
  }

  /** 悬浮面板贴在选中段下方；放不下时翻到上方，随滚动跟随并夹在视口内 */
  const updatePolishCardPosition = () => {
    const session = polishSession.value
    const view = editor.value?.view
    if (!session || !view) return
    const target = getActivePolishTarget()
    const dom = target ? (view.nodeDOM(target.from) as HTMLElement | null) : null
    if (!dom) return
    const rect = dom.getBoundingClientRect()
    const cardWidth = Math.min(600, Math.max(320, rect.width))
    const cardHeight = polishCardRef.value?.offsetHeight || 260
    const viewportHeight = window.innerHeight
    let top = rect.bottom + 8
    if (top + cardHeight > viewportHeight - 8) {
      top = rect.top - cardHeight - 8
    }
    top = Math.min(Math.max(top, 8), Math.max(viewportHeight - cardHeight - 8, 8))
    const left = Math.min(
      Math.max(rect.left, 8),
      Math.max(window.innerWidth - cardWidth - 8, 8),
    )
    polishCardStyle.value = {
      top: `${Math.round(top)}px`,
      left: `${Math.round(left)}px`,
      width: `${Math.round(cardWidth)}px`,
    }
  }

  let polishPositionFrame = 0
  const schedulePolishCardPosition = () => {
    if (polishPositionFrame) return
    polishPositionFrame = window.requestAnimationFrame(() => {
      polishPositionFrame = 0
      updatePolishCardPosition()
    })
  }

  // 面板打开期间跟随滚动/缩放（scroll 不冒泡，用捕获阶段接住编辑器容器的滚动）
  watch(
    () => Boolean(polishSession.value),
    open => {
      if (open) {
        document.addEventListener('scroll', schedulePolishCardPosition, true)
        window.addEventListener('resize', schedulePolishCardPosition)
        void nextTick(() => updatePolishCardPosition())
      } else {
        document.removeEventListener('scroll', schedulePolishCardPosition, true)
        window.removeEventListener('resize', schedulePolishCardPosition)
      }
    },
  )

  // 内容状态切换（加载中→结果）会改变面板高度，重新校位
  watch(
    () => [
      polishSession.value?.loading,
      polishSession.value?.polished,
      polishSession.value?.extraOpen,
    ],
    () => {
      if (polishSession.value) void nextTick(() => updatePolishCardPosition())
    },
  )

  /** 原文引用红标：按命中原句节选切分原段落文本 */
  const polishOriginalSegments = computed(() => {
    const session = polishSession.value
    if (!session) return [] as Array<{ text: string; hit: boolean }>
    const original = session.original
    const needles = (session.quotes || [])
      .map(quote => String(quote || '').replace(/…+$/, '').trim())
      .filter(needle => needle.length >= 6)
    const ranges: Array<[number, number]> = []
    for (const needle of needles) {
      let index = original.indexOf(needle)
      while (index !== -1) {
        ranges.push([index, index + needle.length])
        index = original.indexOf(needle, index + needle.length)
      }
    }
    if (!ranges.length) return [{ text: original, hit: false }]
    ranges.sort((left, right) => left[0] - right[0])
    const merged: Array<[number, number]> = []
    for (const range of ranges) {
      const last = merged[merged.length - 1]
      if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
      else merged.push([...range])
    }
    const segments: Array<{ text: string; hit: boolean }> = []
    let cursor = 0
    for (const [start, end] of merged) {
      if (start > cursor) segments.push({ text: original.slice(cursor, start), hit: false })
      segments.push({ text: original.slice(start, end), hit: true })
      cursor = end
    }
    if (cursor < original.length) segments.push({ text: original.slice(cursor), hit: false })
    return segments
  })

  const closeIssuePolish = () => {
    polishSession.value = null
    editor.value?.commands.setIssueFocus(null)
  }

  const runPolishRequest = async () => {
    const session = polishSession.value
    if (!session || session.loading) return
    const target = getActivePolishTarget()
    const doc = editor.value?.state.doc
    if (!target || !doc || target.blockIndex < 0) {
      closeIssuePolish()
      return
    }
    const prevParagraph =
      target.blockIndex > 0 ? doc.child(target.blockIndex - 1).textContent : ''
    const nextParagraph =
      target.blockIndex < doc.childCount - 1
        ? doc.child(target.blockIndex + 1).textContent
        : ''
    session.loading = true
    session.error = ''
    try {
      const polished = await session.request({
        paragraphText: target.node.textContent,
        prevParagraph: prevParagraph || undefined,
        nextParagraph: nextParagraph || undefined,
        extraRequirement: session.extraText.trim() || undefined,
      })
      if (polishSession.value !== session) return
      session.polished = String(polished || '').trim()
      if (!session.polished) session.error = 'AI 未返回有效改写，请重试'
    } catch (error) {
      if (polishSession.value !== session) return
      session.error = String(error?.message || 'AI 修改失败，请稍后重试')
    } finally {
      if (polishSession.value === session) session.loading = false
    }
  }

  /** 把预览面板锚到某个命中位置（打开或 ‹ › 切换时共用） */
  const anchorPolishTarget = (from: number): boolean => {
    const view = editor.value?.view
    const session = polishSession.value
    if (!view || !session) return false
    const blockIndex = blockIndexAtPos(from)
    const node = view.state.doc.nodeAt(from)
    if (blockIndex < 0 || !node) return false
    editor.value?.commands.setIssueFocus({
      blockIndex,
      label: session.label,
      issueKeys: [session.issueKey],
    })
    session.original = node.textContent
    session.polished = ''
    session.error = ''
    const hits = resolveIssueTargets(session.issueKey, true)
    session.navTotal = hits.length
    session.navCurrent = Math.max(
      0,
      hits.findIndex(hit => hit.from === from),
    )
    scrollFlashIssueTarget(from)
    void nextTick(() => updatePolishCardPosition())
    return true
  }

  const startIssuePolish = (input: {
    issueKey: string
    label: string
    quotes?: string[]
    request: (args: IssuePolishRequestArgs) => Promise<string>
  }): boolean => {
    const view = editor.value?.view
    if (!view) return false
    // 已修改过的灰态段自动跳过；全改完则明确告知，不再有隐式轮巡
    const hits = resolveIssueTargets(input.issueKey, true)
    if (!hits.length) {
      if (resolveIssueTargets(input.issueKey).length) {
        ElMessage.info('这条建议命中的段落都已修改过')
      }
      return false
    }
    // 选中哪段改哪段：正文里已选中本建议的某个命中段时优先它，否则从第一处开始
    const state = issueHighlightPluginKey.getState(view.state)
    const focusedBlock = state?.focus?.issueKeys.includes(input.issueKey)
      ? state.focus.blockIndex
      : -1
    const target =
      hits.find(hit => blockIndexAtPos(hit.from) === focusedBlock) || hits[0]
    polishSession.value = reactive({
      issueKey: input.issueKey,
      label: input.label,
      quotes: input.quotes || [],
      original: '',
      polished: '',
      loading: false,
      error: '',
      extraOpen: false,
      extraText: '',
      navTotal: hits.length,
      navCurrent: 0,
      request: input.request,
    })
    if (!anchorPolishTarget(target.from)) {
      polishSession.value = null
      return false
    }
    void runPolishRequest()
    return true
  }

  /** 悬浮面板内 ‹ › 显式切换命中处（跳过已修改段，循环） */
  const stepPolishTarget = (delta: number) => {
    const session = polishSession.value
    if (!session || session.loading) return
    const hits = resolveIssueTargets(session.issueKey, true)
    if (hits.length <= 1) return
    const active = getActivePolishTarget()
    const currentIndex = active
      ? hits.findIndex(hit => hit.from === active.from)
      : 0
    const nextIndex =
      (currentIndex + delta + hits.length) % hits.length
    if (anchorPolishTarget(hits[nextIndex].from)) {
      void runPolishRequest()
    }
  }

  const applyIssuePolish = () => {
    const session = polishSession.value
    if (!session || session.loading || !session.polished) return
    const view = editor.value?.view
    const target = getActivePolishTarget()
    if (!view || !target) {
      closeIssuePolish()
      return
    }
    if (
      compactIssueText(target.node.textContent) !==
      compactIssueText(session.original)
    ) {
      ElMessage.warning('该段已被手动修改，AI 预览已失效')
      closeIssuePolish()
      return
    }
    polishApplying = true
    try {
      view.dispatch(
        view.state.tr.replaceWith(
          target.from + 1,
          target.from + target.node.nodeSize - 1,
          view.state.schema.text(session.polished),
        ),
      )
    } finally {
      polishApplying = false
    }
    const issueKey = session.issueKey
    closeIssuePolish()
    onIssuePolished(issueKey)
    ElMessage.success('已替换该段，正文将自动保存')
  }

  /** 预览打开期间用户手动改了目标段：预览立即作废，防止替换覆盖手改 */
  const invalidatePolishOnManualEdit = () => {
    if (!polishSession.value || polishApplying) return
    const target = getActivePolishTarget()
    if (
      !target ||
      compactIssueText(target.node.textContent) !==
        compactIssueText(polishSession.value.original)
    ) {
      polishSession.value = null
      editor.value?.commands.setIssueFocus(null)
      ElMessage.info('段落已修改，AI 预览已关闭')
    }
  }

  /** 点击命中段选中加深；点击其他区域取消选中（预览打开时不响应，防误关） */
  const handleIssueHighlightClick = (event: MouseEvent) => {
    if (polishSession.value) return
    const rawTarget = event.target as HTMLElement | null
    const target = rawTarget?.closest?.('.issue-highlight') as HTMLElement | null
    const view = editor.value?.view
    if (!view) return
    if (!target) {
      const state = issueHighlightPluginKey.getState(view.state)
      if (state?.focus) {
        editor.value?.commands.setIssueFocus(null)
        onIssueSelected([])
      }
      return
    }
    let blockIndex = -1
    try {
      blockIndex = blockIndexAtPos(view.posAtDOM(target, 0) - 1)
    } catch {
      blockIndex = -1
    }
    if (blockIndex < 0) return
    const keys = String(target.dataset.issueKeys || '')
      .split('|')
      .filter(Boolean)
    const item = (issueHighlights() || []).find(candidate =>
      keys.includes(candidate.key),
    )
    editor.value?.commands.setIssueFocus({
      blockIndex,
      label: item?.label || '建议',
      issueKeys: keys,
    })
    onIssueSelected(keys)
  }


  onBeforeUnmount(() => {
    // 悬浮预览面板的跟随监听兜底清理（面板关闭时 watch 已移除，这里防卸载竞态）
    document.removeEventListener('scroll', schedulePolishCardPosition, true)
    window.removeEventListener('resize', schedulePolishCardPosition)
    if (polishPositionFrame) {
      window.cancelAnimationFrame(polishPositionFrame)
      polishPositionFrame = 0
    }
  })

  return {
    applyIssueHighlights,
    locateIssueHighlight,
    polishSession,
    polishCardStyle,
    polishCardRef,
    polishOriginalSegments,
    closeIssuePolish,
    runPolishRequest,
    startIssuePolish,
    stepPolishTarget,
    applyIssuePolish,
    invalidatePolishOnManualEdit,
    handleIssueHighlightClick,
  }
}
