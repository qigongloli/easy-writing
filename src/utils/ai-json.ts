const stripJsonFence = (value: unknown) => {
  const holder = (value ?? {}) as { output?: unknown; text?: unknown }
  const raw = typeof value === 'string' ? value : String(holder.output || holder.text || '')
  return raw
    .trim()
    // 思考型模型（千问/DeepSeek-R 系）经部分渠道会把思考段内联进正文，先整段剥掉
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
}

/** 正文里混了说明文字/围栏时，抠出最外层的 {...} 再试一次 */
const extractOuterObject = (source: string) => {
  const start = source.indexOf('{')
  const end = source.lastIndexOf('}')
  if (start < 0 || end <= start) return ''
  return source.slice(start, end + 1)
}

const findArrayStart = (source: string, key: string) => {
  const keyIndex = source.indexOf(`"${key}"`)
  if (keyIndex < 0) return -1
  return source.indexOf('[', keyIndex)
}

const parseCompleteObjects = (source: string, key: string) => {
  const arrayStart = findArrayStart(source, key)
  if (arrayStart < 0) return null

  const list: unknown[] = []
  let start = -1
  let depth = 0
  let escaped = false
  let inString = false

  for (let index = arrayStart + 1; index < source.length; index += 1) {
    const char = source[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') {
      if (depth === 0) start = index
      depth += 1
      continue
    }
    if (char === '}') {
      depth -= 1
      if (depth === 0 && start >= 0) {
        const objectText = source.slice(start, index + 1)
        try {
          list.push(JSON.parse(objectText))
        } catch {
          // 只采纳完整合法的对象，截断内容直接丢弃。
        }
        start = -1
      }
      continue
    }
    if (char === ']' && depth === 0) break
  }

  return list
}

export const parseAiJson = (value: unknown, arrayKeys: string[] = []) => {
  const trimmed = stripJsonFence(value)
  try {
    return JSON.parse(trimmed)
  } catch (error) {
    const outer = extractOuterObject(trimmed)
    if (outer && outer !== trimmed) {
      try {
        return JSON.parse(outer)
      } catch {
        // 最外层对象也不完整（多半被截断），落到下面按数组键抢救
      }
    }
    const fallback = arrayKeys.reduce<Record<string, unknown[]>>((result, key) => {
      const list = parseCompleteObjects(trimmed, key)
      if (list) result[key] = list
      return result
    }, {})

    if (Object.keys(fallback).length) return fallback
    throw error
  }
}
