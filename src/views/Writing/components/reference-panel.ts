export type ReferencePanelToolId = 'outline' | 'character' | 'settings' | 'timeline' | 'storyline'
export type ReferencePanelMode = 'side' | 'popout'

export const REFERENCE_PANEL_TITLES: Record<ReferencePanelToolId, string> = {
  outline: '大纲',
  character: '角色',
  settings: '设定',
  timeline: '时间线',
  storyline: '故事线',
}

const REFERENCE_PANEL_IDS = new Set<string>(Object.keys(REFERENCE_PANEL_TITLES))

export const isReferencePanelTool = (value: unknown): value is ReferencePanelToolId => {
  return typeof value === 'string' && REFERENCE_PANEL_IDS.has(value)
}
