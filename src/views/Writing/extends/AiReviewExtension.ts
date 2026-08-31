import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    aiReview: {
      setAiReviewRange: (range: { from: number; to: number }) => ReturnType
      unsetAiReviewRange: () => ReturnType
    }
  }
}

export default Extension.create({
  name: 'aiReview',

  addCommands() {
    return {
      setAiReviewRange: (range) => ({ tr, dispatch }) => {
        if (dispatch) {
          tr.setMeta('AI_REVIEW_RANGE', range)
        }
        return true
      },
      unsetAiReviewRange: () => ({ tr, dispatch }) => {
        if (dispatch) {
          tr.setMeta('AI_REVIEW_RANGE', null)
        }
        return true
      },
    }
  },

  addProseMirrorPlugins() {
    const key = new PluginKey('aiReview')

    return [
      new Plugin({
        key,
        state: {
          init() {
            return { range: null, deco: DecorationSet.empty }
          },
          apply(tr, prev, oldState, newState) {
            // 1. 检查是否有设置新范围的 Meta
            const action = tr.getMeta('AI_REVIEW_RANGE')

            // 2. 如果有新动作 (设置或清除)
            if (action !== undefined) {
              if (action === null) {
                return { range: null, deco: DecorationSet.empty }
              }
              const { from, to } = action
              const deco = DecorationSet.create(newState.doc, [
                Decoration.inline(from, to, {
                  class: 'ai-review-highlight', // CSS 类名
                  nodeName: 'span'
                })
              ])
              return { range: action, deco }
            }

            // 3. 如果没有新动作，但是文档变了（比如用户还在打字），需要映射位置
            if (tr.docChanged && prev.range) {
              const { from, to } = prev.range
              // map 确保高亮跟随文字移动
              const newFrom = tr.mapping.map(from)
              const newTo = tr.mapping.map(to)

              if (newFrom >= newTo) return { range: null, deco: DecorationSet.empty }

              const deco = DecorationSet.create(newState.doc, [
                Decoration.inline(newFrom, newTo, {
                  class: 'ai-review-highlight',
                  nodeName: 'span'
                })
              ])
              return { range: { from: newFrom, to: newTo }, deco }
            }

            return prev
          },
        },
        props: {
          decorations(state) {
            return key.getState(state).deco
          },
        },
      }),
    ]
  },
})