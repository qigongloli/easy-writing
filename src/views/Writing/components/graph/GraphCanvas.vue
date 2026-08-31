<template>
  <div class="graph-shell">
    <VueFlow
      :nodes="vfNodes"
      :edges="vfEdges"
      :connection-mode="ConnectionMode.Loose"
      :connection-radius="30"
      :min-zoom="0.4"
      :max-zoom="1.8"
      :delete-key-code="null"
      :zoom-on-double-click="false"
      fit-view-on-init
      @connect="handleConnect"
      @connect-start="handleConnectStart"
      @connect-end="handleConnectEnd"
      @node-drag="onNodeDrag"
      @node-drag-stop="onNodeDragStop"
      @node-click="onNodeClick"
      @node-context-menu="onNodeContextMenu"
      @pane-click="onPaneClick"
      @pane-context-menu="onPaneContextMenu"
      @edge-click="onEdgeClick"
      @edge-context-menu="onEdgeContextMenu"
    >
      <template #node-card="nodeProps">
        <div class="graph-card-body">
          <slot name="node" :node="{ id: Number(nodeProps.id), x: nodeProps.position.x, y: nodeProps.position.y }" />
          <Handle id="top" type="source" :position="Position.Top" />
          <Handle id="right" type="source" :position="Position.Right" />
          <Handle id="bottom" type="source" :position="Position.Bottom" />
          <Handle id="left" type="source" :position="Position.Left" />
        </div>
      </template>
      <MiniMap v-if="showMinimap" pannable :width="120" :height="84" />
    </VueFlow>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  ConnectionMode,
  Handle,
  Position,
  VueFlow,
  useVueFlow,
  type Connection,
  type EdgeMouseEvent,
  type NodeDragEvent,
  type NodeMouseEvent,
} from '@vue-flow/core'
import { MiniMap } from '@vue-flow/minimap'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/minimap/dist/style.css'

export interface GraphNodeInput {
  id: number
  x: number
  y: number
}

export interface GraphEdgeInput {
  id: string | number
  from: number
  to: number
  className?: string
  label?: string
}

/**
 * 公共关系画布壳（角色关系图 / 故事线思维导图共用），内核为 Vue Flow：
 * 平移/缩放（光标锚定）/端口拖线/命中检测全部交给成熟库，
 * 本壳只做两层适配——对外保持 nodes/edges + 事件的稳定契约（使用方不感知库），
 * 对内补两个库不管的行为：拖线落在节点身体上也算连接、落在空白发 connect-empty。
 */
const props = withDefaults(defineProps<{
  nodes: GraphNodeInput[]
  edges: GraphEdgeInput[]
  nodeWidth?: number
  nodeHeight?: number
  selectedId?: number | null
  showMinimap?: boolean
}>(), {
  nodeWidth: 150,
  nodeHeight: 60,
  selectedId: null,
  showMinimap: false,
})

const emit = defineEmits<{
  (e: 'connect', fromId: number, toId: number): void
  (e: 'connect-empty', fromId: number, pos: { x: number; y: number }, client: { x: number; y: number }): void
  (e: 'node-moved', id: number, pos: { x: number; y: number }): void
  (e: 'node-click', id: number): void
  (e: 'node-context', id: number, pos: { x: number; y: number }, client: { x: number; y: number }): void
  (e: 'canvas-click'): void
  (e: 'canvas-context', pos: { x: number; y: number }, client: { x: number; y: number }): void
  (e: 'edge-click', id: string | number, client: { x: number; y: number }): void
  (e: 'edge-context', id: string | number, client: { x: number; y: number }): void
  (e: 'node-drag', id: number, pos: { x: number; y: number }): void
}>()

const { viewport, zoomTo, fitView, screenToFlowCoordinate, updateNodeInternals, onPaneReady } = useVueFlow()

const vfNodes = computed(() => props.nodes.map(node => ({
  id: String(node.id),
  type: 'card',
  position: { x: node.x, y: node.y },
  class: props.selectedId === node.id ? 'is-picked' : '',
  style: { width: `${props.nodeWidth}px`, minHeight: `${props.nodeHeight}px` },
  data: {},
})))

/** 连线按两节点相对方位挑最顺的端口（节点移动后随重算换边） */
const pickHandles = (from: GraphNodeInput, to: GraphNodeInput) => {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { s: 'right', t: 'left' } : { s: 'left', t: 'right' }
  }
  return dy >= 0 ? { s: 'bottom', t: 'top' } : { s: 'top', t: 'bottom' }
}

const vfEdges = computed(() => {
  const byId = new Map(props.nodes.map(node => [node.id, node]))
  return props.edges.flatMap(edge => {
    const from = byId.get(edge.from)
    const to = byId.get(edge.to)
    if (!from || !to) return []
    const handles = pickHandles(from, to)
    return [{
      id: `e-${edge.id}`,
      source: String(edge.from),
      target: String(edge.to),
      sourceHandle: handles.s,
      targetHandle: handles.t,
      class: edge.className || '',
      label: edge.label || undefined,
      data: { origId: edge.id },
    }]
  })
})

// 节点尺寸测量兜底：Vue Flow 靠 ResizeObserver 初始化节点，个别环境（嵌入式
// webview/后台渲染）回调迟迟不来会导致整个画布停在隐藏态。挂载与节点增减后
// 主动触发一次直接 DOM 测量，确保节点必然完成初始化。
onPaneReady(() => {
  void nextTick(() => updateNodeInternals())
})

watch(
  () => props.nodes.map(node => node.id).join(','),
  () => {
    void nextTick(() => updateNodeInternals())
  }
)

const clientPoint = (event: MouseEvent) => ({ x: event.clientX, y: event.clientY })
const flowPoint = (event: MouseEvent) => {
  const point = screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
  return { x: Math.round(point.x), y: Math.round(point.y) }
}

// ---- 连接：库内 connect + 补「落在节点身体」与「落在空白」两种收尾 ----
const connectSource = ref<number | null>(null)
let connectedThisDrag = false
// 拖线松手后浏览器会对着 pane 补发一次 click（按下点与松手点的共同祖先），
// 不拦下它会把 connect-empty 刚弹出的菜单/编辑器立刻关掉。
let suppressPaneClickUntil = 0

const onPaneClick = () => {
  if (Date.now() < suppressPaneClickUntil) return
  emit('canvas-click')
}

const handleConnectStart = (params: { nodeId?: string | null }) => {
  connectSource.value = params.nodeId ? Number(params.nodeId) : null
  connectedThisDrag = false
}

const handleConnect = (connection: Connection) => {
  connectedThisDrag = true
  const from = Number(connection.source)
  const to = Number(connection.target)
  if (from && to && from !== to) emit('connect', from, to)
}

const handleConnectEnd = (event?: MouseEvent | TouchEvent) => {
  suppressPaneClickUntil = Date.now() + 150
  const source = connectSource.value
  connectSource.value = null
  if (connectedThisDrag || !source || !(event instanceof MouseEvent)) return
  const nodeEl = (event.target as HTMLElement | null)?.closest('.vue-flow__node') as HTMLElement | null
  const targetId = nodeEl ? Number(nodeEl.dataset.id) : null
  if (targetId && targetId !== source) {
    // 松手在目标节点身体上（没吸附到端口）也算连接
    emit('connect', source, targetId)
    return
  }
  if (!targetId) emit('connect-empty', source, flowPoint(event), clientPoint(event))
}

// ---- 事件转发（string id → 使用方的 number/原始 id） ----
const onNodeDrag = ({ node }: NodeDragEvent) => {
  emit('node-drag', Number(node.id), { x: Math.round(node.position.x), y: Math.round(node.position.y) })
}

const onNodeDragStop = ({ node }: NodeDragEvent) => {
  emit('node-moved', Number(node.id), { x: Math.round(node.position.x), y: Math.round(node.position.y) })
}

const onNodeClick = ({ node }: NodeMouseEvent) => {
  emit('node-click', Number(node.id))
}

const onNodeContextMenu = ({ node, event }: NodeMouseEvent) => {
  if (!(event instanceof MouseEvent)) return
  event.preventDefault()
  emit('node-context', Number(node.id), flowPoint(event), clientPoint(event))
}

const onPaneContextMenu = (event: MouseEvent) => {
  event.preventDefault()
  emit('canvas-context', flowPoint(event), clientPoint(event))
}

const onEdgeClick = ({ edge, event }: EdgeMouseEvent) => {
  if (!(event instanceof MouseEvent)) return
  emit('edge-click', (edge.data as { origId: string | number }).origId, clientPoint(event))
}

const onEdgeContextMenu = ({ edge, event }: EdgeMouseEvent) => {
  if (!(event instanceof MouseEvent)) return
  event.preventDefault()
  emit('edge-context', (edge.data as { origId: string | number }).origId, clientPoint(event))
}

// ---- 工具栏 API（契约与旧壳一致） ----
const zoom = computed(() => viewport.value.zoom)

const setZoom = (value: number) => {
  void zoomTo(Math.max(0.4, Math.min(1.8, Number(value.toFixed(2)))), { duration: 120 })
}

const fitCanvas = (maxZoom = 1) => {
  void fitView({ padding: 0.15, minZoom: 0.4, maxZoom })
}

defineExpose({ zoom, setZoom, fitCanvas })
</script>

<style lang="scss" src="./graph-canvas.scss"></style>
