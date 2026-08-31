import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'

export default Extension.create({
  name: 'persistentSelection',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('persistentSelection'),
        props: {
          decorations(state) {
            // 1. 如果没有选区（只是光标闪烁），不添加装饰
            if (state.selection.empty) {
              return DecorationSet.empty
            }

            // 2. 获取当前选区的开始和结束位置
            const { from, to } = state.selection

            // 3. 创建一个 inline 装饰器，给这段范围加一个 class
            const decorations = [
              Decoration.inline(from, to, {
                class: 'persistent-selection', // 这是我们要在 CSS 里定义的类名
              }),
            ]

            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})