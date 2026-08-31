<template>
  <div class="home-page">
    <div class="home-grid">
      <section class="main-column">
        <div class="home-middle-row">
          <ShelfCard />
          <WritingProgressCard />
        </div>
        <CommonToolsCard />
      </section>

      <aside class="side-column">
        <QuickNoteCard />
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import ShelfCard from './components/ShelfCard.vue'
import WritingProgressCard from './components/WritingProgressCard.vue'
import CommonToolsCard from './components/CommonToolsCard.vue'
import QuickNoteCard from './components/QuickNoteCard.vue'
</script>

<style scoped lang="scss">
.home-page {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding-bottom: 18px;
}

.home-grid {
  display: grid;
  grid-template-columns: minmax(720px, 1fr) minmax(300px, 328px);
  gap: 16px;
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 2px;
}

.main-column {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.side-column {
  display: grid;
  grid-template-rows: auto auto auto;
  align-content: start;
  gap: 16px;
  min-width: 0;
  min-height: 0;
}

.home-middle-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 320px);
  gap: 16px;
  align-items: stretch;
}

@media (max-width: 1200px) {
  .home-grid {
    grid-template-columns: 1fr;
  }

  .side-column {
    order: 2;
    grid-template-rows: none;
    align-items: stretch;
  }
}

@media (max-width: 980px) {
  .home-middle-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 540px) {
  .home-page {
    padding: 0 6px 24px;
  }
}
</style>
