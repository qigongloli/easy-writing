import { ElMessageBox } from 'element-plus'
import type { ElMessageBoxOptions } from 'element-plus'

/**
 * 统一皮肤确认框：包装 ElMessageBox.confirm，默认注入 ink-confirm 皮肤
 * （样式见 styles/common.scss），调用方 options 可覆盖。
 * 兼容 (message, title, options) 与 (message, options) 两种调用形态。
 */
export function inkConfirm(
  message: ElMessageBoxOptions['message'],
  titleOrOptions?: string | ElMessageBoxOptions,
  options?: ElMessageBoxOptions
) {
  const skin = { customClass: 'ink-confirm', confirmButtonClass: 'ink-confirm-btn' }
  if (titleOrOptions && typeof titleOrOptions === 'object') {
    return ElMessageBox.confirm(message, { ...skin, ...titleOrOptions })
  }
  return ElMessageBox.confirm(message, titleOrOptions, { ...skin, ...(options || {}) })
}
