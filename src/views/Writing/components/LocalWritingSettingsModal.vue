<template>
  <SettingsCenterModal v-model:visible="visibleProxy" :book-id="bookId" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import SettingsCenterModal from '@/views/SettingsCenter/SettingsCenterModal.vue'

const props = defineProps<{
  visible: boolean
  bookId?: string | number
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
}>()

const visibleProxy = computed({
  get: () => props.visible,
  set: (value: boolean) => emit('update:visible', value),
})
</script>
