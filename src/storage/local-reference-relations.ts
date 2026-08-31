import type { CharacterRelation, CharacterRelationType } from '@/types'
import {
  findBookIdByEntity,
  mutateDoc,
  nextLocalId,
  ok,
  readDoc,
} from './local-reference-store'

/**
 * 角色关系画布的数据域：连线（无向边，两角色至多一条）+ 各角色卡位置。
 * 与其余参考数据同仓（book-reference 整包），随书备份/导入自动携带。
 */

export const CHARACTER_RELATION_TYPES: Array<{ value: CharacterRelationType; label: string }> = [
  { value: 'family', label: '亲情' },
  { value: 'love', label: '爱情' },
  { value: 'friend', label: '友情' },
  { value: 'enemy', label: '敌对' },
  { value: 'other', label: '其他' },
]

const samePair = (relation: CharacterRelation, aId: number, bId: number) => {
  const from = Number(relation.fromId)
  const to = Number(relation.toId)
  return (from === aId && to === bId) || (from === bId && to === aId)
}

export const listLocalCharacterRelations = async (bookId: string | number) => {
  const doc = await readDoc(bookId)
  return ok({
    relations: doc.characterRelations,
    positions: doc.characterCanvasPositions,
  })
}

export const addLocalCharacterRelation = async (payload: {
  bookId: string | number
  fromId: number
  toId: number
  relationType?: CharacterRelationType
  label?: string
}) => {
  const fromId = Number(payload.fromId)
  const toId = Number(payload.toId)
  if (!fromId || !toId) throw new Error('缺少角色 id')
  if (fromId === toId) throw new Error('不能给同一个角色连自己')
  return mutateDoc(payload.bookId, doc => {
    const has = (id: number) => doc.characters.some(item => Number(item.id) === id)
    if (!has(fromId) || !has(toId)) throw new Error('角色不存在或已删除')
    if (doc.characterRelations.some(item => samePair(item, fromId, toId))) {
      throw new Error('这两个角色已有连线，点击连线可编辑')
    }
    const relation: CharacterRelation = {
      id: nextLocalId(),
      bookId: String(payload.bookId),
      fromId,
      toId,
      relationType: payload.relationType ?? 'other',
      label: payload.label ?? '',
    }
    doc.characterRelations.push(relation)
    return ok(relation)
  })
}

export const updateLocalCharacterRelation = async (payload: {
  id: number
  relationType?: CharacterRelationType
  label?: string
}) => {
  const bookId = await findBookIdByEntity(payload.id, doc => doc.characterRelations)
  return mutateDoc(bookId, doc => {
    const relation = doc.characterRelations.find(item => item.id === payload.id)
    if (!relation) throw new Error('关系不存在')
    if (payload.relationType !== undefined) relation.relationType = payload.relationType
    if (payload.label !== undefined) relation.label = payload.label
    return ok(relation)
  })
}

export const deleteLocalCharacterRelations = async (payload: { ids: number[] }) => {
  const bookId = await findBookIdByEntity(payload.ids[0], doc => doc.characterRelations)
  return mutateDoc(bookId, doc => {
    const doomed = new Set(payload.ids.map(id => Number(id)))
    doc.characterRelations = doc.characterRelations.filter(item => !doomed.has(Number(item.id)))
    return ok(null)
  })
}

/** 画布位置批量落盘（拖拽结束/自动整理时整批写，键=角色 id） */
export const saveLocalCharacterCanvasPositions = async (payload: {
  bookId: string | number
  positions: Record<string, { x: number; y: number }>
}) => {
  return mutateDoc(payload.bookId, doc => {
    for (const [id, position] of Object.entries(payload.positions || {})) {
      doc.characterCanvasPositions[id] = {
        x: Math.round(Number(position.x) || 0),
        y: Math.round(Number(position.y) || 0),
      }
    }
    return ok(null)
  })
}
