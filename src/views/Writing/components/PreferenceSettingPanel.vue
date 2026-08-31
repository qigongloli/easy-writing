<template>
  <div class="preference-panel">
    <h3 class="panel-title">偏好设置</h3>

    <!-- 音效 -->
    <div class="setting-group">
      <div class="group-label"><i class="fa-solid fa-music"></i> 沉浸音效</div>
      <div class="option-grid">
        <div
v-for="opt in soundOptions" :key="opt.value" class="opt-btn" :class="{ active: typingSound === opt.value }"
          @click="setTypingSound(opt.value)">
          {{ opt.label }}
        </div>
      </div>
    </div>

    <!-- 特效 -->
    <div class="setting-group">
      <div class="group-label"><i class="fa-solid fa-wand-magic-sparkles"></i> 视觉特效</div>
      <div class="option-grid">
        <div
v-for="opt in effectOptions" :key="opt.value" class="opt-btn"
          :class="{ active: typingEffect === opt.value }" @click="setTypingEffect(opt.value)">
          {{ opt.label }}
        </div>
      </div>
    </div>
    <!-- 自爆模式 -->
    <div class="setting-group">
      <div class="group-label" style="color: #b91c1c;">
        <i class="fa-solid fa-bomb"></i> 自爆测试 (停止打字触发)
      </div>
      <div class="option-grid" style="grid-template-columns: repeat(5, 1fr); gap: 4px;">
        <div
v-for="opt in selfDestructOptions" :key="opt.value" class="opt-btn warn-btn"
          :class="{ active: selfDestructMode === opt.value }" @click="setSelfDestructMode(opt.value)">
          {{ opt.label }}
        </div>
      </div>
    </div>

    <div class="setting-group">
      <div class="group-label"><i class="fa-solid fa-highlighter"></i> 角色设定高亮</div>
      <div class="switch-row">
        <span>{{ entityHighlightEnabled ? '已开启' : '已关闭' }}</span>
        <el-switch
          :model-value="entityHighlightEnabled"
          @change="(value: string | number | boolean) => setEntityHighlightEnabled(Boolean(value))"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useWritingEditorStore } from '@/stores/writing-editor';
import { storeToRefs } from 'pinia';
import { TYPING_SOUND_OPTIONS } from '@/config/typing-sounds';

const store = useWritingEditorStore();
const { typingSound, typingEffect, selfDestructMode, entityHighlightEnabled } = storeToRefs(store);
const { setTypingSound, setTypingEffect, setSelfDestructMode, setEntityHighlightEnabled } = store;

const soundOptions = TYPING_SOUND_OPTIONS;

const effectOptions = [
  { label: '挥毫泼墨', value: 'splash' },
  { label: '墨纹涟漪', value: 'ripple' },
  { label: '云烟缭绕', value: 'mist' },
  { label: '真实烈焰', value: 'fire' },
  { label: '文字鼓励', value: 'cheer' },
  { label: '无特效', value: 'none' }
] as const;

const selfDestructOptions = [
  { label: '关', value: 'off' },
  { label: '10秒', value: '10s' },
  { label: '20秒', value: '20s' },
  { label: '1分', value: '1m' },
  { label: '5分', value: '5m' }
] as const;
</script>

<style scoped lang="scss">
.preference-panel {
  padding: 16px;
  width: 100%;
  box-sizing: border-box;
  background-color: var(--ui-bg);
  color: var(--ink-main);
}

.panel-title {
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--ui-border);
  color: var(--ink-main);
}

.setting-group {
  margin-bottom: 20px;

  &:last-child {
    margin-bottom: 0;
  }
}

.group-label {
  font-size: 12px;
  color: var(--ink-sec);
  margin-bottom: 8px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

.option-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.opt-btn {
  padding: 8px 6px;
  font-size: 13px;
  border-radius: 6px;
  border: 2px solid var(--input-border);
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
  background: var(--input-bg);
  color: var(--ink-main);

  &:hover {
    border-color: var(--ink-sec);
  }

  &.active {
    border: 2px solid var(--ink-accent);
  }
}

.warn-btn {
  border-color: var(--state-danger-border);
  color: var(--state-danger-on);

  &.active {
    background: var(--state-danger-strong-bg);
    color: var(--state-danger-strong-on);
    border-color: var(--state-danger-strong-bg);
    font-weight: bold;
    border-width: 1px;
    /* Reset border width for active state if needed */
  }

  &:hover:not(.active) {
    background: var(--state-danger-surface);
    border-color: var(--state-danger-border);
  }
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 34px;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--input-border);
  background: var(--input-bg);
  color: var(--ink-main);
  font-size: 13px;
}
</style>
