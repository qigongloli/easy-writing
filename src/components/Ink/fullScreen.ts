import { createVNode, render } from 'vue';
import InkSpinner from '@/components/Ink/InkSpinner.vue';

// 定义一个变量存储 DOM 容器
let loadingContainer: HTMLElement | null = null;
let needLoadingRequestCount = 0;

/**
 * 创建并显示全屏 Loading
 */
const startLoading = () => {
  if (loadingContainer) return; // 如果已经存在，就不重复创建

  // 1. 创建挂载容器 div
  loadingContainer = document.createElement('div');
  loadingContainer.setAttribute('class', 'ink-full-screen-mask');

  // 2. 创建虚拟节点 (VNode)
  // 你可以在这里传入 props，比如修改 text 或 size
  const vnode = createVNode(InkSpinner, {
    text: '加载中...',
    size: '80px',
    color: '#1a1a1a'
  });

  // 3. 将 VNode 渲染到容器中
  render(vnode, loadingContainer);

  // 4. 将容器追加到 body
  document.body.appendChild(loadingContainer);
};

/**
 * 销毁并移除 Loading
 */
const endLoading = () => {
  if (!loadingContainer) return;

  // 1. 销毁 VNode (触发 unmounted 生命周期)
  render(null, loadingContainer);

  // 2. 移除 DOM
  if (document.body.contains(loadingContainer)) {
    document.body.removeChild(loadingContainer);
  }

  loadingContainer = null;
};

/**
 * 对外暴露：开启全屏加载 (带计数器)
 */
export const showFullScreenLoading = () => {
  if (needLoadingRequestCount === 0) {
    startLoading();
  }
  needLoadingRequestCount++;
};

/**
 * 对外暴露：关闭全屏加载 (带计数器 + 防抖)
 */
export const tryHideFullScreenLoading = () => {
  if (needLoadingRequestCount <= 0) return;
  needLoadingRequestCount--;

  if (needLoadingRequestCount === 0) {
    // 延迟 300ms 关闭，避免接口连接紧密时闪烁
    setTimeout(() => {
      if (needLoadingRequestCount === 0) {
        endLoading();
      }
    }, 300);
  }
};
