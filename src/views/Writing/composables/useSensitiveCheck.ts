import { computed, onBeforeUnmount, ref, type Ref } from 'vue'
import {
  scanSensitiveText,
  SENSITIVE_LEXICON_UPDATED_EVENT,
  type SensitiveMatchItem,
} from '@/storage/local-sensitive-words'

/**
 * 敏感词校对（状态栏「敏感词」指示 + 编辑器内高亮）。
 *
 * 开源版：数据源为本地词库（@/storage/local-sensitive-words，内置基础词库 +
 * 用户自定义层），全文扫描在本机同步完成，零网络请求。
 * 高亮通道（setSensitiveWords/clearSensitive）是纯前端能力，直接复用。
 */

interface SensitiveEditorLike {
  commands: {
    setSensitiveWords: (words: string[]) => void
    clearSensitive: () => void
  }
}

interface UseSensitiveCheckOptions {
  editor: Ref<SensitiveEditorLike | undefined>
  activeChapterId: Ref<number | string | null | undefined>
  readEditorText: () => string
}

export const useSensitiveCheck = (options: UseSensitiveCheckOptions) => {
  const { editor, activeChapterId, readEditorText } = options

  const sensitiveMatches = ref<SensitiveMatchItem[]>([])
  const sensitiveMatchCount = ref(0)
  const sensitiveCheckTimer = ref<number | null>(null)

  const sensitiveStatusValue = computed(() =>
    sensitiveMatchCount.value > 0 ? `${sensitiveMatchCount.value} 处` : '正常'
  )

  const sensitiveTooltipText = computed(() => {
    if (!sensitiveMatches.value.length) return ''
    return sensitiveMatches.value
      .map(item => `${item.word} · ${item.typeLabel} · ${item.count}次`)
      .join('；')
  })

  const applySensitiveState = (
    words: string[],
    matches: SensitiveMatchItem[],
    total: number
  ) => {
    sensitiveMatches.value = matches
    sensitiveMatchCount.value = total

    if (!editor.value) return
    if (words.length) {
      editor.value.commands.setSensitiveWords(words)
    } else {
      editor.value.commands.clearSensitive()
    }
  }

  const clearSensitiveCheckTimer = () => {
    if (sensitiveCheckTimer.value) {
      window.clearTimeout(sensitiveCheckTimer.value)
      sensitiveCheckTimer.value = null
    }
  }

  const resetSensitiveState = () => {
    clearSensitiveCheckTimer()
    applySensitiveState([], [], 0)
  }

  const runSensitiveCheck = async (content?: string) => {
    const text = String(content ?? readEditorText() ?? '')
    if (!editor.value || !activeChapterId.value || !text.trim()) {
      applySensitiveState([], [], 0)
      return
    }
    const result = scanSensitiveText(text)
    applySensitiveState(result.words, result.matches, result.total)
  }

  const scheduleSensitiveCheck = (content?: string) => {
    if (!activeChapterId.value) {
      resetSensitiveState()
      return
    }
    clearSensitiveCheckTimer()
    sensitiveCheckTimer.value = window.setTimeout(() => {
      void runSensitiveCheck(content)
    }, 1200)
  }

  // 设置中心改词库后立即对当前章节重扫，不用等下一次输入
  const handleLexiconUpdated = () => {
    void runSensitiveCheck()
  }
  window.addEventListener(SENSITIVE_LEXICON_UPDATED_EVENT, handleLexiconUpdated)
  onBeforeUnmount(() => {
    window.removeEventListener(SENSITIVE_LEXICON_UPDATED_EVENT, handleLexiconUpdated)
    clearSensitiveCheckTimer()
  })

  return {
    sensitiveMatchCount,
    sensitiveStatusValue,
    sensitiveTooltipText,
    resetSensitiveState,
    runSensitiveCheck,
    scheduleSensitiveCheck
  }
}
