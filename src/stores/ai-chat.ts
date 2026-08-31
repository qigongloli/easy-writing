import { defineStore } from 'pinia'

export interface AiSelectionPayload {
  id?: string
  title: string
  range?: string
  content: string
}

export interface AiSelectionItem extends AiSelectionPayload {
  id: string
}

interface AiChatState {
  pendingSelections: AiSelectionItem[]
}

export const useAiChatStore = defineStore({
  id: 'ew-ai-chat',
  state: (): AiChatState => ({
    pendingSelections: []
  }),
  actions: {
    enqueueSelection(payload: AiSelectionPayload) {
      const id = payload.id || `sel-${Date.now()}-${Math.random().toString(16).slice(2)}`
      this.pendingSelections.push({
        ...payload,
        id
      })
    },
    consumeSelections(): AiSelectionItem[] {
      if (this.pendingSelections.length === 0) return []
      const list = [...this.pendingSelections]
      this.pendingSelections = []
      return list
    },
    clearSelections() {
      this.pendingSelections = []
    }
  }
})
