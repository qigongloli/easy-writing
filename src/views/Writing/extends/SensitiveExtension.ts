import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { Node } from 'prosemirror-model'

export interface SensitiveOptions {
  words: string[]
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    sensitive: {
      setSensitiveWords: (words: string[]) => ReturnType
      clearSensitive: () => ReturnType
    }
  }
}

// 辅助函数：在文档节点中查找所有匹配的词，并返回 Range
function findWords(doc: Node, words: string[]): { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = []
  if (!words.length) return ranges

  // 遍历所有文本节点
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      for (const word of words) {
        let index = node.text.indexOf(word)
        while (index !== -1) {
          ranges.push({
            from: pos + index,
            to: pos + index + word.length,
          })
          // 继续查找下一个
          index = node.text.indexOf(word, index + 1)
        }
      }
    }
  })
  return ranges
}

export default Extension.create<SensitiveOptions>({
  name: 'sensitive',

  addOptions() {
    return {
      words: [],
    }
  },

  addCommands() {
    return {
      // 设置违规词列表
      setSensitiveWords: (words: string[]) => ({ tr, dispatch }) => {
        if (dispatch) {
          tr.setMeta('SENSITIVE_WORDS', words)
        }
        return true
      },
      // 清空高亮
      clearSensitive: () => ({ tr, dispatch }) => {
        if (dispatch) {
          tr.setMeta('SENSITIVE_WORDS', [])
        }
        return true
      }
    }
  },

  addProseMirrorPlugins() {
    const key = new PluginKey('sensitive')

    return [
      new Plugin({
        key,
        state: {
          init() {
            return { words: [], deco: DecorationSet.empty }
          },
          apply(tr, prev, oldState, newState) {
            // 1. 检查是否有设置新词的 Meta
            const newWords = tr.getMeta('SENSITIVE_WORDS')

            // 2. 如果文档变动了（用户修改内容），或者有了新词列表
            if (tr.docChanged || newWords !== undefined) {
              const words = newWords !== undefined ? newWords : prev.words

              // 如果列表为空，清空装饰
              if (words.length === 0) {
                return { words: [], deco: DecorationSet.empty }
              }

              // 重新计算所有装饰位置
              const ranges = findWords(newState.doc, words)
              const decorations = ranges.map(({ from, to }) => {
                return Decoration.inline(from, to, {
                  class: 'sensitive-word', // CSS 类名
                  // 可以在这里加 data 属性，用于 hover 显示提示
                  'data-tip': '敏感词违规',
                })
              })

              return {
                words,
                deco: DecorationSet.create(newState.doc, decorations)
              }
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