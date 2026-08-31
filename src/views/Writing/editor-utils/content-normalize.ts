import type { JsonRecord } from '@/types/json'
import { Fragment, Slice } from 'prosemirror-model'
import type { EditorView } from 'prosemirror-view'

/**
 * 正文内容归一化（纯函数，无组件状态）：
 * 旧数据可能只存了纯文本或 JSON 字符串，喂给 Tiptap 前统一整形；
 * 另含 AI 补全的上下文节选与纯文本粘贴切片。
 */

export const EMPTY_EDITOR_DOC = '<p></p>'

export const isValidTipTapDoc = (payload: unknown): payload is JsonRecord => {
  return (
    !!payload && typeof payload === 'object' && typeof (payload as JsonRecord).type === 'string'
  )
}

const looksLikeJson = (value: string) => {
  if (!value) return false
  const startChar = value.trim().charAt(0)
  return startChar === '{' || startChar === '['
}

const escapeHtml = (value: string) => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export const normalizePlainTextRows = (value: string) => {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/^[ \t\u3000]+|[ \t\u3000]+$/g, ''))
    .filter((line) => line.trim())
}

const plainTextToHtmlDoc = (value: string) => {
  const rows = normalizePlainTextRows(value)
  const html = rows
    .map((line) => {
      return `<p>${escapeHtml(line)}</p>`
    })
    .join('')
  return html || EMPTY_EDITOR_DOC
}

export const buildPlainTextPasteSlice = (view: EditorView, rows: string[]) => {
  const paragraph = view.state.schema.nodes.paragraph
  const nodes = rows.map((line) =>
    paragraph.create(null, view.state.schema.text(line)),
  )
  // 两端开放（openStart/openEnd=1）：首行并入光标所在段落，末行与光标后的剩余文字相接。
  // 此前写死 (0, 0) 全封闭——内核会把光标所在段落劈开、按独立段落块插入，
  // 导致粘贴任何内容（哪怕几个字）都必然换行。
  return new Slice(Fragment.fromArray(nodes), 1, 1)
}

export const normalizeEditorContentPayload = (raw: unknown) => {
  if (raw == null) return EMPTY_EDITOR_DOC
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return EMPTY_EDITOR_DOC
    if (looksLikeJson(trimmed)) {
      try {
        const parsed = JSON.parse(trimmed)
        if (isValidTipTapDoc(parsed)) return parsed
      } catch {
        // ignore malformed JSON, fallback to html/text handling
      }
    }
    if (
      /<(p|h[1-6]|ul|ol|blockquote|pre|div|span|img|strong|em|br|code|li)/i.test(
        trimmed,
      )
    ) {
      return trimmed
    }
    return plainTextToHtmlDoc(trimmed)
  }
  if (isValidTipTapDoc(raw)) {
    return raw
  }
  return EMPTY_EDITOR_DOC
}

export const plainTextToTiptapJson = (value: string) => {
  const rows = normalizePlainTextRows(value)
  return {
    type: 'doc',
    content: (rows.length ? rows : ['']).map((line) => {
      const text = String(line || '')
      return text
        ? { type: 'paragraph', content: [{ type: 'text', text }] }
        : { type: 'paragraph' }
    }),
  }
}

export const extractSceneTailAnchor = (
  text: string,
  maxSentences = 3,
  maxLength = 320,
) => {
  const normalized = String(text || '')
    .replace(/\r/g, '\n')
    .trim()
  if (!normalized) return ''
  const sentences = normalized
    .split(/(?<=[。！？!?；;])/)
    .map((item) => item.trim())
    .filter(Boolean)
  const anchor = sentences.length
    ? sentences.slice(-maxSentences).join(' ')
    : normalized.slice(-maxLength)
  return anchor.length > maxLength ? anchor.slice(-maxLength) : anchor
}

export const extractAutocompletePrefix = (
  text: string,
  maxSentences = 3,
  maxLength = 260,
) => {
  const normalized = String(text || '')
    .replace(/\r/g, '\n')
    .trim()
  if (!normalized) return ''
  const lines = normalized
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
  if (!lines.length) return normalized.slice(-maxLength)

  const currentLine = lines[lines.length - 1]
  const previousLine = lines.length > 1 ? lines[lines.length - 2] : ''
  const localFocus =
    currentLine.length >= 80
      ? currentLine
      : [previousLine, currentLine].filter(Boolean).join(' ')
  const sentences = localFocus
    .split(/(?<=[。！？!?；;])/)
    .map((item) => item.trim())
    .filter(Boolean)
  const prefix = sentences.length
    ? sentences.slice(-maxSentences).join(' ')
    : localFocus.slice(-maxLength)
  return prefix.length > maxLength ? prefix.slice(-maxLength) : prefix
}
