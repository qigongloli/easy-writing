<template>
  <div class="writing-panel-window">
    <WritingReferencePanelHost
      v-if="toolId"
      :tool-id="toolId"
      :title="panelTitle"
      :book-id="bookId"
      panel-mode="popout"
      @close="closeWindow"
      @dock="dockToMainWindow"
      @lore-updated="notifyLoreUpdated"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { isTauriRuntime } from '@/storage'
import WritingReferencePanelHost from './components/WritingReferencePanelHost.vue'
import {
  REFERENCE_PANEL_TITLES,
  isReferencePanelTool,
  type ReferencePanelToolId,
} from './components/reference-panel'

const route = useRoute()

const bookId = computed(() => String(route.params.bookId || ''))
const toolId = computed<ReferencePanelToolId | null>(() => {
  const raw = route.params.tool
  const value = Array.isArray(raw) ? raw[0] : raw
  return isReferencePanelTool(value) ? value : null
})
const panelTitle = computed(() => toolId.value ? REFERENCE_PANEL_TITLES[toolId.value] : '')

const emitDesktopEvent = async (event: string) => {
  if (!isTauriRuntime() || !toolId.value) return
  const { emit } = await import('@tauri-apps/api/event')
  await emit(event, {
    bookId: bookId.value,
    toolId: toolId.value,
  })
}

const closeCurrentWindow = async () => {
  if (isTauriRuntime()) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().destroy()
    return
  }
  window.close()
}

const closeWindow = async () => {
  await closeCurrentWindow()
}

const dockToMainWindow = async () => {
  await emitDesktopEvent('ew-writing-panel-dock')
  await closeCurrentWindow()
}

const notifyLoreUpdated = async () => {
  await emitDesktopEvent('ew-writing-lore-updated')
}
</script>

<style scoped lang="scss">
.writing-panel-window {
  width: 100vw;
  height: 100%;
  overflow: hidden;
  background: var(--panel-bg);

  :deep(.panel-content) {
    width: 100%;
    height: 100%;
  }
}
</style>
