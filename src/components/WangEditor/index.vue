<template>
  <div :class="['editor-box', self_disabled ? 'editor-disabled' : '']">
    <!-- <Toolbar v-if="!hideToolBar" class="editor-toolbar" :editor="editorRef" :default-config="toolbarConfig" :mode="mode" /> -->
    <Editor
v-model="valueHtml" class="editor-content" :style="{ height }" :mode="mode" :default-config="editorConfig"
      @on-created="handleCreated" @on-blur="handleBlur" />
  </div>
</template>

<script setup lang="ts" name="WangEditor">
import { nextTick, computed, inject, shallowRef, onBeforeUnmount } from "vue";
import { IToolbarConfig, IEditorConfig, IDomEditor } from "@wangeditor/editor";
import { Editor } from "@wangeditor/editor-for-vue";
import "@wangeditor/editor/dist/css/style.css";
import { formContextKey, formItemContextKey } from "element-plus";

// 富文本 DOM 元素
const editorRef = shallowRef<IDomEditor | null>(null);

// 实列化编辑器
const handleCreated = (editor: IDomEditor) => {
  editorRef.value = editor;
};

// 接收父组件参数，并设置默认值
interface RichEditorProps {
  value: string; // 富文本值 ==> 必传
  toolbarConfig?: Partial<IToolbarConfig>; // 工具栏配置 ==> 非必传（默认为空）
  editorConfig?: Partial<IEditorConfig>; // 编辑器配置 ==> 非必传（默认为空）
  height?: string; // 富文本高度 ==> 非必传（默认为 500px）
  mode?: "default" | "simple"; // 富文本模式 ==> 非必传（默认为 default）
  hideToolBar?: boolean; // 是否隐藏工具栏 ==> 非必传（默认为false）
  disabled?: boolean; // 是否禁用编辑器 ==> 非必传（默认为false）
}
const props = withDefaults(defineProps<RichEditorProps>(), {
  toolbarConfig: () => {
    return {
      excludeKeys: []
    };
  },
  editorConfig: () => {
    return {
      placeholder: "暂无内容...",
      MENU_CONF: {},
      hoverbarKeys: {
        text: {
          menuKeys: [
            "headerSelect",
            "bulletedList",
            "|",
            "bold",
            "through",
            "color",
            "bgColor",
            "clearStyle"
          ]
        }
      }
    };
  },
  height: "100%",
  mode: "default",
  hideToolBar: false,
  disabled: false
});

// 获取 el-form 组件上下文
const formContext = inject(formContextKey, void 0);
// 获取 el-form-item 组件上下文
const formItemContext = inject(formItemContextKey, void 0);
// 判断是否禁用上传和删除
const self_disabled = computed(() => {
  return props.disabled || formContext?.disabled;
});

// 判断当前富文本编辑器是否禁用
if (self_disabled.value) nextTick(() => editorRef.value?.disable());

// 富文本的内容监听，触发父组件改变，实现双向数据绑定
const emit = defineEmits<{
  "update:value": [value: string];
  "check-validate": [];
}>();
const valueHtml = computed({
  get() {
    return props.value;
  },
  set(val: string) {
    // 防止富文本内容为空时，校验失败
    if (editorRef.value?.isEmpty()) val = "";
    emit("update:value", val);
  }
});


// 编辑框失去焦点时触发
const handleBlur = () => {
  formItemContext?.prop && formContext?.validateField([formItemContext.prop as string]);
};

// 组件销毁时，也及时销毁编辑器
onBeforeUnmount(() => {
  if (!editorRef.value) return;
  editorRef.value.destroy();
});

defineExpose({
  editor: editorRef
});
</script>

<style scoped lang="scss">
@use "./index.scss";
</style>
