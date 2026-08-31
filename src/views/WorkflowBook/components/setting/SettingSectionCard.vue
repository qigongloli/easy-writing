<template>
  <article class="setting-card" :class="size ? `size-${size}` : ''">
    <div class="setting-card__head">
      <span class="setting-card__icon"><i :class="icon"></i></span>
      <strong class="setting-card__title">{{ title }}</strong>
    </div>
    <div class="setting-card__body">
      <slot />
    </div>
  </article>
</template>

<script setup lang="ts">
defineProps<{ icon: string; title: string; size?: 'normal' | 'half' | 'full' }>()
</script>
