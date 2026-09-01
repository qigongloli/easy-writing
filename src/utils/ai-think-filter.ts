/**
 * 思考段过滤：部分 OpenAI 兼容渠道会把推理模型的思考过程用 <think>…</think>
 * 内联在 content 里（MiniMax M2 官方接口、OpenRouter/硅基流动路由的部分模型）。
 * 正文场景一旦漏进思考文字，会被直接写进用户小说，必须在请求层统一剥掉。
 */

const OPEN_TAG = '<think>'
const CLOSE_TAG = '</think>'

/** 非流式整段清洗：闭合段整段删；只剩开标签没闭合（被截断）时，其后全为思考内容一并丢弃 */
export const stripThinkBlocks = (text: string): string => {
  const withoutClosed = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '')
  const openAt = withoutClosed.toLowerCase().indexOf(OPEN_TAG)
  return openAt >= 0 ? withoutClosed.slice(0, openAt) : withoutClosed
}

/** 尾部若可能是半截标签（如 "<thi"），先扣住不吐，等下一片补齐再判断 */
const holdbackLength = (lowerText: string): number => {
  const max = Math.min(CLOSE_TAG.length - 1, lowerText.length)
  for (let n = max; n > 0; n -= 1) {
    const tail = lowerText.slice(-n)
    if (OPEN_TAG.startsWith(tail) || CLOSE_TAG.startsWith(tail)) return n
  }
  return 0
}

/**
 * 流式过滤器：push 喂增量、返回可见文本；finish 在流结束时取回被扣住的尾巴。
 * 思考段内的内容直接丢弃；流在思考段内被打断时，未闭合部分不吐出。
 */
export const createThinkStreamFilter = () => {
  let carry = ''
  let inThink = false

  const push = (chunk: string): string => {
    carry += String(chunk || '')
    let out = ''
    for (;;) {
      const lower = carry.toLowerCase()
      if (inThink) {
        const close = lower.indexOf(CLOSE_TAG)
        if (close < 0) {
          // 思考内容直接丢，只留可能是半截闭标签的尾巴
          carry = carry.slice(carry.length - holdbackLength(lower))
          return out
        }
        carry = carry.slice(close + CLOSE_TAG.length)
        inThink = false
        continue
      }
      const open = lower.indexOf(OPEN_TAG)
      if (open >= 0) {
        out += carry.slice(0, open)
        carry = carry.slice(open + OPEN_TAG.length)
        inThink = true
        continue
      }
      const hold = holdbackLength(lower)
      out += carry.slice(0, carry.length - hold)
      carry = carry.slice(carry.length - hold)
      return out
    }
  }

  const finish = (): string => {
    // 正常收尾：半截标签其实是普通文本，如实吐出；思考段没闭合则整体丢弃
    const rest = inThink ? '' : carry
    carry = ''
    inThink = false
    return rest
  }

  return { push, finish }
}
