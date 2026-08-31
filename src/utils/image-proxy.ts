/**
 * 图片取回工具（开源版：无服务端代理，全部直取）。
 *
 * - data:/blob: 本身可直接使用（本地生图与封面的主路径，同源无跨域问题）；
 * - 远程地址（生图兜底存的图床 url 等）尝试直接 fetch：桌面端多数可行，
 *   网页端可能被跨域拦下——如实报错，不再有服务端代理可回退。
 */

/** data:/blob: 本身可直接使用，无需取图 */
const isLocalImageUrl = (url: string) => url.startsWith('data:') || url.startsWith('blob:')

/** 无需取回即可直接作为 img src / 背景图使用的地址 */
export const canDisplayImageDirectly = (url: string) => isLocalImageUrl(url)

/** 取回图片 blob；失败抛可读错误 */
export const fetchImageBlob = async (url: string): Promise<Blob> => {
  if (!url) throw new Error('图片地址无效')
  let response: Response
  try {
    response = await fetch(url)
  } catch {
    throw new Error('远程图片获取失败（可能已过期或受跨域限制）')
  }
  if (!response.ok) throw new Error('图片加载失败')
  return response.blob()
}

/** 取回图片并生成 objectURL（调用方负责 revokeObjectURL） */
const fetchImageObjectUrl = async (url: string) => {
  const blob = await fetchImageBlob(url)
  return URL.createObjectURL(blob)
}

/**
 * 取可用于 canvas 绘制的图片源。
 * data:/blob: 直接返回（revoke=false）；其余取回 blob 转 objectURL（revoke=true，调用方用完需释放）。
 */
export const getImageObjectSource = async (url: string): Promise<{ url: string; revoke: boolean }> => {
  if (!url || isLocalImageUrl(url)) {
    return { url, revoke: false }
  }
  const objectUrl = await fetchImageObjectUrl(url)
  return { url: objectUrl, revoke: true }
}
