/**
 * 未类型化的 JSON 透传对象（planMeta / run 载荷 / AI 产物等）。
 *
 * 这些数据的形状由运行期的 JSON 内容决定，历史上散落着上百处
 * `Record<string, any>`。收编成一个具名类型：类型债集中在这一处、
 * 一眼可查全部消费方；后续逐块类型化时把用点换成真实类型即可。
 * 新代码优先定义真实类型，确属 JSON 透传再用它。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON 透传的唯一豁免点，见文件头
export type JsonRecord = Record<string, any>
