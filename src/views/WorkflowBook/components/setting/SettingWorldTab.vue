<template>
  <div class="setting-card-grid">
    <SettingSectionCard
      v-for="card in cards"
      :key="card.id"
      :icon="card.icon"
      :title="card.title"
      :size="card.size"
    >
      <div v-if="card.tags?.length" class="setting-tag-row">
        <span v-for="tag in card.tags" :key="tag" class="setting-tag">{{ tag }}</span>
      </div>
      <ul v-else-if="card.bullets?.length" class="setting-bullet-list">
        <li v-for="(bullet, index) in card.bullets" :key="index">
          <WorkflowInlineEdit
            block
            multiline
            :rows="2"
            :model-value="bullet"
            @update:model-value="updateBullet(card, index, $event)"
          />
        </li>
      </ul>
      <WorkflowInlineEdit
        v-else
        block
        :multiline="isMultilineCard(card)"
        :rows="getCardRows(card)"
        :model-value="card.content || ''"
        @update:model-value="updateCard(card.id, { content: $event })"
      />
    </SettingSectionCard>
  </div>
</template>

<script setup lang="ts">
import WorkflowInlineEdit from '../WorkflowInlineEdit.vue'
import SettingSectionCard from './SettingSectionCard.vue'
import type { WorkflowSettingCard } from '../../types'

const props = defineProps<{ cards: WorkflowSettingCard[] }>()
const emit = defineEmits<{ (event: 'update', cards: WorkflowSettingCard[]): void }>()

const isMultilineCard = (card: WorkflowSettingCard) => card.id !== 'world-name'
const getCardRows = (card: WorkflowSettingCard) => (card.size === 'full' ? 4 : 3)

const updateCard = (id: string, payload: Partial<WorkflowSettingCard>) => {
  emit('update', props.cards.map(item => (item.id === id ? { ...item, ...payload } : item)))
}

const updateBullet = (card: WorkflowSettingCard, index: number, value: string) => {
  const bullets = (card.bullets || []).map((item, i) => (i === index ? value : item))
  updateCard(card.id, { bullets })
}
</script>
