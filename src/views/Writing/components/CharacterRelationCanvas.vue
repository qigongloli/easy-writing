<template>
  <div class="relation-canvas-shell">
    <Teleport to="body" :disabled="!fullscreen">
      <div class="relation-stage" :class="{ fullscreen }">
        <div class="relation-toolbar">
          <div class="relation-legend">
            <span v-for="item in CHARACTER_RELATION_TYPES" :key="item.value" :class="`legend-${item.value}`">
              <i></i>{{ item.label }}
            </span>
          </div>
          <button class="ink-btn-action" type="button" @click="autoArrange">
            <i class="fa-solid fa-sitemap"></i>
            <span>自动整理</span>
          </button>
          <div class="zoom-group">
            <button type="button" @click="graphRef?.setZoom((graphRef?.zoom || 1) - 0.1)">-</button>
            <span>{{ Math.round((graphRef?.zoom || 1) * 100) }}%</span>
            <button type="button" @click="graphRef?.setZoom((graphRef?.zoom || 1) + 0.1)">+</button>
          </div>
          <button class="ink-btn-action" type="button" @click="graphRef?.fitCanvas(fullscreen ? 1 : 0.78)">
            <i class="fa-solid fa-up-right-and-down-left-from-center"></i>
            <span>适应画布</span>
          </button>
          <button class="icon-action" type="button" :title="fullscreen ? '退出全屏' : '全屏'" @click="fullscreen = !fullscreen">
            <i :class="fullscreen ? 'fa-solid fa-compress' : 'fa-solid fa-expand'"></i>
          </button>
        </div>

        <div v-if="loading" class="relation-state">加载中...</div>
        <!-- 空态做浮层提示：画布常驻，右键随时可新建第一个角色 -->
        <div v-if="!loading && !nodes.length" class="relation-empty-hint">
          <i class="fa-regular fa-user"></i>
          <p>还没有角色</p>
          <span>右键画布任意位置新建角色</span>
        </div>
        <GraphCanvas
          v-show="!loading"
          ref="graphRef"
          :nodes="nodes"
          :edges="graphEdges"
          :node-width="NODE_W"
          :node-height="NODE_H"
          :selected-id="selectedId"
          @connect="handleConnect"
          @connect-empty="handleConnectEmpty"
          @node-moved="persistPosition"
          @node-click="id => (selectedId = id)"
          @node-context="openNodeMenu"
          @canvas-click="handleCanvasClick"
          @canvas-context="openCanvasMenu"
          @edge-click="id => openEdgeEditor(Number(id))"
          @edge-context="openEdgeMenu"
        >
          <template #node="{ node }">
            <div class="relation-card">
              <h3>{{ characterName(node.id) || '未命名' }}</h3>
              <span :class="`role-${characterRole(node.id)}`">{{ roleLabel(characterRole(node.id)) }}</span>
            </div>
          </template>
        </GraphCanvas>

        <div v-if="editing" class="edge-editor" @click.stop>
          <div class="edge-editor-row">
            <label
              v-for="item in CHARACTER_RELATION_TYPES"
              :key="item.value"
              :class="[`legend-${item.value}`, { checked: editing.relationType === item.value }]"
            >
              <input v-model="editing.relationType" type="radio" :value="item.value" />
              <i></i>{{ item.label }}
            </label>
          </div>
          <div class="edge-editor-row">
            <input
              v-model="editing.label"
              type="text"
              maxlength="12"
              placeholder="关系标签（师徒、宿敌、青梅竹马……）"
              @keyup.enter="saveEdge"
            />
            <button class="ink-btn-action" type="button" @click="saveEdge">保存</button>
            <button class="ink-btn-action danger" type="button" @click="removeEdge(editing.id)">删除</button>
            <button class="icon-action" type="button" title="关闭" @click="editing = null">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        <GraphMenu
          v-if="menu"
          :x="menu.clientX"
          :y="menu.clientY"
          :items="menuItems"
          @select="handleMenuSelect"
          @close="menu = null"
        />
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { inkConfirm } from '@/utils/ink-confirm'
import { showApiError } from '@/utils/api-error'
import type { Character, CharacterRelation, CharacterRelationType } from '@/types'
import { addLocalCharacter, deleteLocalCharacters, listLocalCharacters } from '@/storage/local-reference'
import {
  CHARACTER_RELATION_TYPES,
  addLocalCharacterRelation,
  deleteLocalCharacterRelations,
  listLocalCharacterRelations,
  saveLocalCharacterCanvasPositions,
  updateLocalCharacterRelation,
} from '@/storage/local-reference-relations'
import GraphCanvas from './graph/GraphCanvas.vue'
import GraphMenu, { type GraphMenuItem } from './graph/GraphMenu.vue'

const props = defineProps<{
  bookId?: string | number
}>()

const emit = defineEmits<{
  /** 画布上新建/删除了角色，资料页签与实体高亮需要刷新 */
  (e: 'characters-changed'): void
  /** 「编辑资料」：切回资料页签并选中该角色 */
  (e: 'edit-character', id: number): void
}>()

const NODE_W = 150
const NODE_H = 60
const ROLE_LABELS = ['主角', '配角', '反派', '路人']

const loading = ref(false)
const characters = ref<Character[]>([])
const relations = ref<CharacterRelation[]>([])
const positions = ref<Record<string, { x: number; y: number }>>({})
const selectedId = ref<number | null>(null)
const editing = ref<{ id: number; relationType: CharacterRelationType; label: string } | null>(null)
const fullscreen = ref(false)
const graphRef = ref<InstanceType<typeof GraphCanvas> | null>(null)
const menu = ref<{
  type: 'canvas' | 'node' | 'edge' | 'connect-empty'
  clientX: number
  clientY: number
  pos?: { x: number; y: number }
  targetId?: number
  fromId?: number
} | null>(null)

const characterById = computed(() => new Map(characters.value.map(item => [Number(item.id), item])))
const characterName = (id: number) => characterById.value.get(id)?.name || ''
const characterRole = (id: number) => Number(characterById.value.get(id)?.role) || 0
const roleLabel = (role: number) => ROLE_LABELS[role] || '角色'

/** 没存过位置的角色按圆环默认布局摆放（确定性，不落盘，拖动才落盘） */
const defaultPosition = (index: number, total: number) => {
  const radius = Math.max(180, total * 34)
  const angle = (index / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2
  return {
    x: Math.round(radius + 60 + radius * Math.cos(angle)),
    y: Math.round(radius + 40 + radius * Math.sin(angle)),
  }
}

const nodes = computed(() =>
  characters.value.map((item, index) => {
    const saved = positions.value[String(item.id)]
    const fallback = defaultPosition(index, characters.value.length)
    return { id: Number(item.id), x: saved ? saved.x : fallback.x, y: saved ? saved.y : fallback.y }
  })
)

const graphEdges = computed(() =>
  relations.value.map(relation => ({
    id: relation.id,
    from: Number(relation.fromId),
    to: Number(relation.toId),
    className: `rel-${relation.relationType}`,
    label: relation.label || CHARACTER_RELATION_TYPES.find(item => item.value === relation.relationType)?.label || '关系',
  }))
)

const menuItems = computed<GraphMenuItem[]>(() => {
  if (!menu.value) return []
  if (menu.value.type === 'canvas') {
    return [{ key: 'create', label: '新建角色', icon: 'fa-solid fa-user-plus' }]
  }
  if (menu.value.type === 'connect-empty') {
    return [{ key: 'create-link', label: '新建角色并连线', icon: 'fa-solid fa-link' }]
  }
  if (menu.value.type === 'node') {
    return [
      { key: 'edit', label: '编辑资料', icon: 'fa-solid fa-pen' },
      { key: 'delete-node', label: '删除角色', icon: 'fa-solid fa-trash-can', danger: true },
    ]
  }
  return [
    { key: 'edit-edge', label: '编辑关系', icon: 'fa-solid fa-pen' },
    { key: 'delete-edge', label: '删除连线', icon: 'fa-solid fa-link-slash', danger: true },
  ]
})

const reload = async () => {
  if (!props.bookId) return
  loading.value = true
  try {
    const [characterRes, relationRes] = await Promise.all([
      listLocalCharacters({ bookId: String(props.bookId), page: 1, size: 500 }),
      listLocalCharacterRelations(props.bookId),
    ])
    characters.value = Array.isArray(characterRes.data?.list) ? characterRes.data.list : []
    relations.value = relationRes.data.relations
    positions.value = { ...relationRes.data.positions }
  } catch (error) {
    console.error('加载角色关系失败:', error)
    showApiError(error, '加载角色关系失败')
  } finally {
    loading.value = false
  }
}

const handleCanvasClick = () => {
  selectedId.value = null
  editing.value = null
  menu.value = null
}

// ---- 连线：端口拖拽一步到位 ----
const createRelation = async (fromId: number, toId: number) => {
  const { data } = await addLocalCharacterRelation({ bookId: props.bookId!, fromId, toId })
  relations.value = [...relations.value, data]
  openEdgeEditor(data.id)
}

const handleConnect = async (fromId: number, toId: number) => {
  try {
    await createRelation(fromId, toId)
  } catch (error) {
    showApiError(error, '保存连线失败')
  }
}

const handleConnectEmpty = (fromId: number, pos: { x: number; y: number }, client: { x: number; y: number }) => {
  menu.value = { type: 'connect-empty', clientX: client.x, clientY: client.y, pos, fromId }
}

// ---- 右键菜单 ----
const openCanvasMenu = (pos: { x: number; y: number }, client: { x: number; y: number }) => {
  menu.value = { type: 'canvas', clientX: client.x, clientY: client.y, pos }
}

const openNodeMenu = (id: number, _pos: { x: number; y: number }, client: { x: number; y: number }) => {
  selectedId.value = id
  menu.value = { type: 'node', clientX: client.x, clientY: client.y, targetId: id }
}

const openEdgeMenu = (id: string | number, client: { x: number; y: number }) => {
  menu.value = { type: 'edge', clientX: client.x, clientY: client.y, targetId: Number(id) }
}

const handleMenuSelect = async (key: string) => {
  const current = menu.value
  menu.value = null
  if (!current) return
  if (key === 'create' && current.pos) {
    await createCharacterAt(current.pos)
  } else if (key === 'create-link' && current.pos && current.fromId) {
    await createCharacterAt(current.pos, current.fromId)
  } else if (key === 'edit' && current.targetId) {
    emit('edit-character', current.targetId)
  } else if (key === 'delete-node' && current.targetId) {
    await deleteCharacter(current.targetId)
  } else if (key === 'edit-edge' && current.targetId) {
    openEdgeEditor(current.targetId)
  } else if (key === 'delete-edge' && current.targetId) {
    await removeEdge(current.targetId, { confirm: false })
  }
}

const createCharacterAt = async (pos: { x: number; y: number }, connectFromId?: number) => {
  if (!props.bookId) return
  try {
    const { data: character } = await addLocalCharacter({ bookId: String(props.bookId), name: '新角色' })
    const position = {
      x: Math.max(10, Math.round(pos.x - NODE_W / 2)),
      y: Math.max(10, Math.round(pos.y - NODE_H / 2)),
    }
    await saveLocalCharacterCanvasPositions({ bookId: props.bookId, positions: { [String(character.id)]: position } })
    characters.value = [...characters.value, character]
    positions.value[String(character.id)] = position
    selectedId.value = Number(character.id)
    emit('characters-changed')
    if (connectFromId) await createRelation(connectFromId, Number(character.id))
  } catch (error) {
    showApiError(error, '新建角色失败')
  }
}

const deleteCharacter = async (id: number) => {
  const name = characterName(id) || '该角色'
  try {
    await inkConfirm(`确定删除「${name}」吗？涉及它的关系连线会一并删除。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await deleteLocalCharacters({ ids: [id] })
    selectedId.value = null
    editing.value = null
    await reload()
    emit('characters-changed')
    ElMessage.success('角色已删除')
  } catch (error) {
    showApiError(error, '删除角色失败')
  }
}

// ---- 连线编辑 ----
const openEdgeEditor = (relationId: number) => {
  const relation = relations.value.find(item => item.id === relationId)
  if (!relation) return
  editing.value = { id: relation.id, relationType: relation.relationType, label: relation.label || '' }
}

const saveEdge = async () => {
  if (!editing.value) return
  try {
    const { data } = await updateLocalCharacterRelation({
      id: editing.value.id,
      relationType: editing.value.relationType,
      label: editing.value.label.trim(),
    })
    relations.value = relations.value.map(item => (item.id === data.id ? data : item))
    editing.value = null
    ElMessage.success('关系已保存')
  } catch (error) {
    showApiError(error, '保存关系失败')
  }
}

const removeEdge = async (relationId: number, options: { confirm?: boolean } = {}) => {
  if (options.confirm !== false) {
    try {
      await inkConfirm('确定删除这条关系连线吗？', '删除确认', {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      })
    } catch {
      return
    }
  }
  try {
    await deleteLocalCharacterRelations({ ids: [relationId] })
    relations.value = relations.value.filter(item => item.id !== relationId)
    if (editing.value?.id === relationId) editing.value = null
    ElMessage.success('关系已删除')
  } catch (error) {
    showApiError(error, '删除关系失败')
  }
}

// ---- 位置持久化 ----
const persistPosition = async (id: number, pos: { x: number; y: number }) => {
  if (!props.bookId) return
  positions.value[String(id)] = pos
  try {
    await saveLocalCharacterCanvasPositions({ bookId: props.bookId, positions: { [String(id)]: pos } })
  } catch (error) {
    showApiError(error, '保存位置失败')
  }
}

const autoArrange = async () => {
  if (!props.bookId || !characters.value.length) return
  const next: Record<string, { x: number; y: number }> = {}
  characters.value.forEach((item, index) => {
    next[String(item.id)] = defaultPosition(index, characters.value.length)
  })
  positions.value = next
  try {
    await saveLocalCharacterCanvasPositions({ bookId: props.bookId, positions: next })
    ElMessage.success('已按圆环重新排布')
  } catch (error) {
    showApiError(error, '保存位置失败')
  }
}

const closeFullscreenByKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && fullscreen.value) fullscreen.value = false
}

watch(() => props.bookId, () => void reload())

onMounted(() => {
  void reload()
  window.addEventListener('keydown', closeFullscreenByKey)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', closeFullscreenByKey)
})
</script>

<style scoped lang="scss" src="./character-relation-canvas.scss"></style>
