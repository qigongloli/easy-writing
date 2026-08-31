/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module '@wangeditor/editor-for-vue' {
  import { DefineComponent } from 'vue'
  const Editor: DefineComponent<{}, {}, any>
  const Toolbar: DefineComponent<{}, {}, any>
  export { Editor, Toolbar }
}
