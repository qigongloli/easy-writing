/**
 * 全站唯一字数口径：去掉所有空白字符后按字符计数。
 * 书架、写作台、码字统计、历史快照必须都走这一个函数，
 * 任何一处偷偷换口径都会造成"同一章在不同页面字数不一致"。
 */
export const countWords = (text?: string | null) => String(text ?? '').replace(/\s+/g, '').length
