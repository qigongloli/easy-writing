import { createApp, type Directive, type App, reactive, h } from 'vue';
import InkSpinner from '@/components/Ink/InkSpinner.vue';

// 扩展 HTMLElement 类型以便存储插件实例
interface HTMLElementWithInk extends HTMLElement {
  _inkMask?: HTMLElement;
  _inkApp?: App;
  _inkState?: { text: string }; // 用于响应式更新文字
}

const inkLoadingDirective: Directive = {
  mounted(el: HTMLElementWithInk, binding) {
    // 1. 解析参数
    const value = binding.value || {};
    const isShow = typeof value === 'boolean' ? value : !!value.show; // 支持 v-ink-loading="true" 或 v-ink-loading="{show: true}"
    const text = typeof value === 'object' ? (value.text || '') : '';

    // 2. 创建遮罩层容器
    const mask = document.createElement('div');
    mask.className = 'ink-loading-mask';
    // 继承父元素圆角
    mask.style.borderRadius = getComputedStyle(el).borderRadius;

    // 3. 创建响应式状态对象
    // 这是为了在 updated 钩子中修改 text 时，组件能自动更新
    const state = reactive({ text: text });

    // 4. 创建 Vue 实例
    // 使用 render 函数包裹 InkSpinner，并将 reactive state 作为 props 传入
    const app = createApp({
      render() {
        return h(InkSpinner, {
          text: state.text,
          size: '60px' // 默认遮罩里的尺寸
        });
      }
    });

    // 5. 挂载组件
    app.mount(mask);

    // 6. 将实例存储在 DOM 元素上，方便后续操作
    el._inkMask = mask;
    el._inkApp = app;
    el._inkState = state;

    // 7. 处理父元素定位
    // Loading 遮罩是 absolute 的，所以父元素必须有定位
    const style = getComputedStyle(el);
    if (!['absolute', 'fixed', 'sticky'].includes(style.position)) {
      el.classList.add('ink-loading-parent--relative');
    }

    // 8. 初始显示
    if (isShow) {
      el.appendChild(mask);
    }
  },

  updated(el: HTMLElementWithInk, binding) {
    const newVal = binding.value || {};
    const oldVal = binding.oldValue || {};

    // 解析新旧值
    const newShow = typeof newVal === 'boolean' ? newVal : !!newVal.show;
    const oldShow = typeof oldVal === 'boolean' ? oldVal : !!oldVal.show;

    const newText = typeof newVal === 'object' ? (newVal.text || '') : '';
    const oldText = typeof oldVal === 'object' ? (oldVal.text || '') : '';

    // 1. 更新文字 (如果变化)
    if (newText !== oldText && el._inkState) {
      el._inkState.text = newText; // 响应式更新，界面会自动重绘
    }

    // 2. 切换显示/隐藏
    if (newShow !== oldShow) {
      if (newShow) {
        if (el._inkMask && !el.contains(el._inkMask)) {
          el.appendChild(el._inkMask);
        }
      } else {
        if (el._inkMask && el.contains(el._inkMask)) {
          el.removeChild(el._inkMask);
        }
      }
    }
  },

  unmounted(el: HTMLElementWithInk) {
    // 清理内存
    if (el._inkApp) {
      el._inkApp.unmount();
    }
    if (el._inkMask && el.contains(el._inkMask)) {
      el.removeChild(el._inkMask);
    }
    // 清空引用
    delete el._inkMask;
    delete el._inkApp;
    delete el._inkState;
  }
};

export default {
  install(app: App) {
    app.directive('ink-loading', inkLoadingDirective);
  }
};


// <div v-ink-loading="{ show: isLoading, text: '正在生成大纲...' }">
//   内容区域...
// </div>
