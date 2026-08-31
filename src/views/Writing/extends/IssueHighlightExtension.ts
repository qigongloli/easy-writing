import { Extension } from '@tiptap/core'
import { Node } from 'prosemirror-model'
import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'

/**
 * 审稿建议正文标注（左色条 + 浅底色，按等级三色）+ 选中态 + AI 修改预览挂载。
 *
 * 与实体高亮同一套装饰层机制，但按"段落下标"而非文字匹配定位：
 * 服务端建议携带 splitParagraphs 下标与命中原句节选（quotes），
 * 候选保存时正文按段生成文档，顶层段落节点与下标一一对应。
 * 锚定原则"宁可不标不错标"：带 quotes 的建议先校验目标段确实包含
 * 原句，不符则在 ±3 段内找回，找不回丢弃该段标注；
 * 用户编辑后装饰随文档位移自动跟随，段内容变化则降级为灰色
 * "已修改"态——改没改好要等重新质检，不能继续顶着等级色误导。
 *
 * 选中态：点击命中段或从卡片进入时，该段底色加深、左色条加粗，并显示
 * "建议 N"小签（只在选中态出现，正文平时没有徽章）。AI 修改预览卡是
 * 脱离文档流的悬浮面板，由编辑器组件按选中段位置定位，本扩展只维护
 * 选中态装饰。
 */

/** 三级等级：blocking=需确认(红)、advise=建议修改(橙)、polish=可优化(蓝) */
export type IssueHighlightLevel = 'blocking' | 'advise' | 'polish'

export interface IssueHighlightItem {
  /** 建议唯一键（与确认面板同源），定位原文按它找段落 */
  key: string
  level: IssueHighlightLevel
  /** 选中态小签文案（"建议 1"/"需确认"），由父级按卡片顺序生成 */
  label?: string
  /** 命中段落下标（基于服务端 splitParagraphs 分段） */
  paragraphs: number[]
  /** 命中原句节选：锚定校验用；缺省时信任下标 */
  quotes?: string[]
}

/** 选中态：focus 到某个文档顶层段落（下标为当前文档实际块序） */
export interface IssueHighlightFocus {
  blockIndex: number
  label: string
  issueKeys: string[]
}

interface IssueDecorationSpec {
  issueKeys: string[]
  level: IssueHighlightLevel
  /** 段落内容指纹（压缩后前 16 字）：编辑检测用 */
  fingerprint: string
  edited: boolean
  active: boolean
  activeLabel: string
}

interface IssueHighlightState {
  items: IssueHighlightItem[]
  focus: IssueHighlightFocus | null
  deco: DecorationSet
}

const ITEMS_META = 'ISSUE_HIGHLIGHTS'
const FOCUS_META = 'ISSUE_HIGHLIGHT_FOCUS'
export const issueHighlightPluginKey = new PluginKey<IssueHighlightState>('issueHighlight')

const LEVEL_RANK: Record<IssueHighlightLevel, number> = {
  blocking: 3,
  advise: 2,
  polish: 1,
}

/** 锚定校验在 ±3 段内找回：更远大概率是正文已大改，标注宁缺毋错 */
const ANCHOR_SEARCH_RADIUS = 3

const compact = (value: string) => String(value || '').replace(/\s+/g, '')

const fingerprintOf = (node: Node) => compact(node.textContent).slice(0, 16)

/** 引用节选转锚定针：去掉截断省略号，取前 24 字压缩文本 */
const quoteNeedle = (quote: string) =>
  compact(String(quote || '').replace(/…+$/, '')).slice(0, 24)

const collectTopBlocks = (doc: Node) => {
  const blocks: Array<{ node: Node; pos: number }> = []
  doc.forEach((node, offset) => {
    blocks.push({ node, pos: offset })
  })
  return blocks
}

const blockMatchesQuotes = (node: Node, needles: string[]) => {
  if (!needles.length) return true
  const text = compact(node.textContent)
  return needles.some(needle => needle && text.includes(needle))
}

const decorationClass = (spec: IssueDecorationSpec) => {
  const classes = ['issue-highlight', `issue-level-${spec.level}`]
  if (spec.edited) classes.push('is-edited')
  if (spec.active) classes.push('is-active')
  return classes.join(' ')
}

const buildDecoration = (
  pos: number,
  node: Node,
  spec: IssueDecorationSpec,
) =>
  Decoration.node(
    pos,
    pos + node.nodeSize,
    {
      class: decorationClass(spec),
      'data-issue-keys': spec.issueKeys.join('|'),
      ...(spec.active && spec.activeLabel
        ? { 'data-issue-label': spec.activeLabel }
        : {}),
    },
    spec as unknown as Record<string, unknown>,
  )

function buildDecorations(
  doc: Node,
  items: IssueHighlightItem[],
  focus: IssueHighlightFocus | null,
): DecorationSet {
  const blocks = collectTopBlocks(doc)
  if (!blocks.length) return DecorationSet.empty

  // 段落下标 → 该段命中的全部建议（等级取最高）
  const hits = new Map<number, { keys: string[]; level: IssueHighlightLevel }>()
  for (const item of items) {
    const needles = (item.quotes || []).map(quoteNeedle).filter(Boolean)
    for (const paragraphIndex of item.paragraphs || []) {
      if (!Number.isInteger(paragraphIndex) || paragraphIndex < 0) continue
      let resolved = -1
      const primary = blocks[paragraphIndex]
      if (primary && blockMatchesQuotes(primary.node, needles)) {
        resolved = paragraphIndex
      } else if (needles.length) {
        for (let offset = 1; offset <= ANCHOR_SEARCH_RADIUS && resolved < 0; offset += 1) {
          for (const candidate of [paragraphIndex - offset, paragraphIndex + offset]) {
            const block = blocks[candidate]
            if (block && blockMatchesQuotes(block.node, needles)) {
              resolved = candidate
              break
            }
          }
        }
      }
      if (resolved < 0) continue
      const existing = hits.get(resolved)
      if (existing) {
        if (!existing.keys.includes(item.key)) existing.keys.push(item.key)
        if (LEVEL_RANK[item.level] > LEVEL_RANK[existing.level]) {
          existing.level = item.level
        }
      } else {
        hits.set(resolved, { keys: [item.key], level: item.level })
      }
    }
  }

  const decorations: Decoration[] = []
  for (const [paragraphIndex, hit] of hits) {
    const block = blocks[paragraphIndex]
    if (!block) continue
    const active = focus?.blockIndex === paragraphIndex
    decorations.push(
      buildDecoration(block.pos, block.node, {
        issueKeys: hit.keys,
        level: hit.level,
        fingerprint: fingerprintOf(block.node),
        edited: false,
        active,
        activeLabel: active ? focus?.label || '' : '',
      }),
    )
  }
  return DecorationSet.create(doc, decorations)
}

/** 编辑跟踪：位移后的装饰逐个对指纹，段内容变了降级为灰色"已修改"态 */
function refreshEditedFlags(deco: DecorationSet, doc: Node): DecorationSet {
  const current = deco.find()
  if (!current.length) return deco
  let changed = false
  const next: Decoration[] = []
  for (const decoration of current) {
    const spec = decoration.spec as unknown as IssueDecorationSpec
    const node = doc.nodeAt(decoration.from)
    if (!node || !node.isBlock) {
      changed = true
      continue
    }
    if (!spec.edited && fingerprintOf(node) !== spec.fingerprint) {
      changed = true
      next.push(buildDecoration(decoration.from, node, { ...spec, edited: true }))
      continue
    }
    next.push(buildDecoration(decoration.from, node, spec))
  }
  return changed ? DecorationSet.create(doc, next) : deco
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    issueHighlight: {
      setIssueHighlights: (items: IssueHighlightItem[]) => ReturnType
      setIssueFocus: (focus: IssueHighlightFocus | null) => ReturnType
      clearIssueHighlights: () => ReturnType
    }
  }
}

export default Extension.create({
  name: 'issueHighlight',

  addCommands() {
    return {
      setIssueHighlights: (items: IssueHighlightItem[]) => ({ tr, dispatch }) => {
        if (dispatch) tr.setMeta(ITEMS_META, items)
        return true
      },
      setIssueFocus: (focus: IssueHighlightFocus | null) => ({ tr, dispatch }) => {
        if (dispatch) tr.setMeta(FOCUS_META, { focus })
        return true
      },
      clearIssueHighlights: () => ({ tr, dispatch }) => {
        if (dispatch) tr.setMeta(ITEMS_META, [])
        return true
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<IssueHighlightState>({
        key: issueHighlightPluginKey,
        state: {
          init() {
            return { items: [], focus: null, deco: DecorationSet.empty }
          },
          apply(tr, prev, _oldState, newState) {
            const nextItems = tr.getMeta(ITEMS_META) as IssueHighlightItem[] | undefined
            const focusMeta = tr.getMeta(FOCUS_META) as
              | { focus: IssueHighlightFocus | null }
              | undefined
            if (nextItems !== undefined || focusMeta !== undefined) {
              const items = nextItems !== undefined ? nextItems : prev.items
              // 标注清单更换（换章/刷新）时选中态一并失效
              const focus =
                nextItems !== undefined && focusMeta === undefined
                  ? null
                  : focusMeta !== undefined
                    ? focusMeta.focus
                    : prev.focus
              return {
                items,
                focus,
                deco: buildDecorations(newState.doc, items, focus),
              }
            }
            if (tr.docChanged) {
              const mapped = prev.deco.map(tr.mapping, newState.doc)
              return { ...prev, deco: refreshEditedFlags(mapped, newState.doc) }
            }
            return prev
          },
        },
        props: {
          decorations(state) {
            return issueHighlightPluginKey.getState(state)?.deco || DecorationSet.empty
          },
        },
      }),
    ]
  },
})
