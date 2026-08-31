<template>
  <section class="design-panel creative-direction-panel">
    <div class="creative-direction-heading">
      <div class="design-panel__title">
        <i class="fa-solid fa-bullseye"></i>
        <span>创作方向</span>
      </div>
      <span
        class="creative-direction-status"
        :class="{ ready: directionReady }"
      >
        <i :class="directionReady ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-exclamation'"></i>
        {{ directionReady ? '定位已完整' : missingDirectionText }}
      </span>
    </div>

    <div class="creative-direction-grid">
      <label class="direction-control">
        <span>发布平台 <em>*</em></span>
        <el-select
          :model-value="baseConfig.platform"
          class="ink-select workflow-config-select"
          popper-class="ink-select-popper"
          fit-input-width
          @change="selectPlatform(String($event))"
        >
          <el-option
            v-for="platform in platformOptions"
            :key="platform.code"
            :label="platform.name"
            :value="platform.name"
          />
        </el-select>
      </label>

      <label class="direction-control">
        <span>目标读者 <em>*</em></span>
        <el-select
          :model-value="baseConfig.audience"
          class="ink-select workflow-config-select"
          popper-class="ink-select-popper"
          fit-input-width
          @change="selectAudience(String($event))"
        >
          <el-option
            v-for="option in audienceOptions"
            :key="option"
            :label="option"
            :value="option"
          />
        </el-select>
      </label>

      <label class="direction-control">
        <span>小说类型 <em>*</em></span>
        <el-select
          :model-value="selectedGenre"
          class="ink-select workflow-config-select"
          popper-class="ink-select-popper"
          filterable
          allow-create
          fit-input-width
          placeholder="请选择或输入类型"
          @change="selectGenre(String($event))"
        >
          <el-option
            v-for="option in genreOptions"
            :key="option"
            :label="option"
            :value="option"
          />
        </el-select>
      </label>

      <label class="direction-control direction-control--tags">
        <span>风格标签</span>
        <el-select
          :model-value="baseConfig.tags"
          class="ink-select workflow-config-select"
          popper-class="ink-select-popper"
          multiple
          filterable
          allow-create
          collapse-tags
          collapse-tags-tooltip
          fit-input-width
          placeholder="可选"
          @change="updateTags"
        >
          <el-option
            v-for="tag in tagOptions"
            :key="tag"
            :label="tag"
            :value="tag"
          />
        </el-select>
      </label>

      <label class="direction-control direction-control--model">
        <span>本次模型</span>
        <ModelChip
          :model-value="baseConfig.modelCode"
          group-code="workflow_book"
          scope="book"
          @update:model-value="handleModelChange"
        />
      </label>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ModelChip from '@/components/ModelChip.vue'
import type { WorkflowBaseConfig, WorkflowDraft } from '../types'
import type {
  WorkflowPlatformCategoryResource,
  WorkflowResources,
} from '@/types/workflow'

const props = withDefaults(defineProps<{
  draft: WorkflowDraft
  resources?: WorkflowResources | null
}>(), {
  resources: null,
})

const emit = defineEmits<{
  (event: 'patch', payload: Partial<WorkflowDraft>): void
}>()

const baseConfig = computed(() => props.draft.baseConfig)
const platformOptions = computed(() => props.resources?.platforms || [])
const selectedPlatform = computed(() =>
  platformOptions.value.find(item => item.name === baseConfig.value.platform)
)
const audienceOptions = computed(() =>
  props.resources?.selectFields.find(item => item.key === 'audience')?.options || ['男频', '女频']
)

const resolveAudienceGender = (audience: string) => {
  if (audience.includes('女')) return 'female'
  if (audience.includes('男')) return 'male'
  return ''
}

const allRankCategories = computed<WorkflowPlatformCategoryResource[]>(() => {
  const platformCode = selectedPlatform.value?.code || ''
  return props.resources?.platformCategories?.[platformCode] || []
})
const rankCategories = computed(() => {
  const gender = resolveAudienceGender(baseConfig.value.audience)
  return gender
    ? allRankCategories.value.filter(item => item.gender === gender)
    : allRankCategories.value
})
const hasRankCategories = computed(() => rankCategories.value.length > 0)
const selectedGenre = computed(() =>
  hasRankCategories.value
    ? baseConfig.value.platformCategory
    : baseConfig.value.genre
)
const genreOptions = computed(() => Array.from(new Set([
  ...(hasRankCategories.value
    ? rankCategories.value.map(item => item.name)
    : props.resources?.genres || []),
  selectedGenre.value,
].filter(Boolean))))
const tagOptions = computed(() => Array.from(new Set([
  ...(props.resources?.tags || []),
  ...baseConfig.value.tags,
])))

const directionReady = computed(() => Boolean(
  baseConfig.value.platform.trim() &&
  baseConfig.value.audience.trim() &&
  baseConfig.value.genre.trim() &&
  (!hasRankCategories.value || baseConfig.value.platformCategory.trim())
))
const missingDirectionText = computed(() => {
  if (!baseConfig.value.platform.trim()) return '请选择发布平台'
  if (!baseConfig.value.audience.trim()) return '请选择目标读者'
  return '请选择小说类型'
})

// 方向配置始终整包替换，确保草稿只有一个状态来源。
const updateBaseConfig = (payload: Partial<WorkflowBaseConfig>) => {
  emit('patch', {
    baseConfig: {
      ...props.draft.baseConfig,
      ...payload,
    },
  })
}

// 切换平台时清理旧平台专属分类，避免灵感生成携带失效榜单类型。
const selectPlatform = (platformName: string) => {
  const platform = platformOptions.value.find(item => item.name === platformName)
  if (!platform) return
  const gender = resolveAudienceGender(baseConfig.value.audience)
  const categories = props.resources?.platformCategories?.[platform.code] || []
  const requiresRankCategory = categories.some(item => !gender || item.gender === gender)
  const genre = requiresRankCategory ? '' : baseConfig.value.genre
  updateBaseConfig({
    platform: platform.name,
    genre,
    platformCategory: requiresRankCategory ? '' : genre,
    platformCategoryCode: '',
    platformCategorySource: 'common',
  })
}

const selectAudience = (audience: string) => {
  const selectedCategory = allRankCategories.value.find(
    item => item.code === baseConfig.value.platformCategoryCode
  )
  const gender = resolveAudienceGender(audience)
  const categoryInvalid = Boolean(
    baseConfig.value.platformCategorySource === 'rank' &&
    gender &&
    selectedCategory?.gender !== gender
  )
  updateBaseConfig({
    audience,
    ...(categoryInvalid
      ? {
          genre: '',
          platformCategory: '',
          platformCategoryCode: '',
          platformCategorySource: 'common' as const,
        }
      : {}),
  })
}

const selectGenre = (genre: string) => {
  const value = genre.trim()
  if (!value) return
  const rankCategory = rankCategories.value.find(item => item.name === value)
  const isCommonGenre = (props.resources?.genres || []).includes(value)
  updateBaseConfig({
    genre: value,
    platformCategory: value,
    platformCategoryCode: rankCategory?.code || '',
    platformCategorySource: rankCategory ? 'rank' : isCommonGenre ? 'common' : 'custom',
  })
}

const updateTags = (value: unknown) => {
  const tags = Array.isArray(value)
    ? value.map(item => String(item).trim()).filter(Boolean)
    : []
  updateBaseConfig({ tags })
}

// 空值表示沿用用户的 AI 功能偏好，具体模型表示本书显式锁定。
const handleModelChange = (modelCode: string) => {
  updateBaseConfig({
    modelCode,
    modelFollowPreference: modelCode === '',
  })
}
</script>
