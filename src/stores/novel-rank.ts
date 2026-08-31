import { defineStore } from 'pinia'
import piniaPersistConfig from '@/stores/helper/persist'
import type { NovelRankHomePreference } from '@/types/novel-rank'

export const useNovelRankStore = defineStore('ew-novel-rank', {
  state: () => ({
    lastFilter: null as NovelRankHomePreference | null
  }),
  actions: {
    setLastFilter(filter: NovelRankHomePreference) {
      this.lastFilter = filter
    }
  },
  persist: piniaPersistConfig('ew-novel-rank', ['lastFilter'])
})
