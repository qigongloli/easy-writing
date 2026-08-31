<template>
          <section class="settings-pane">
            <section class="settings-card sync-status-card">
              <div class="cloud-badge"><i class="fa-solid fa-hard-drive"></i></div>
              <div class="sync-status-main">
                <span>保存方式</span>
                <strong>全部内容保存在本机</strong>
                <small>最近本地备份：{{ formatLocaleDateTime(settingsDraft.lastBackupAt, '暂无') }}</small>
                <small>当前设备：{{ desktopSupported ? '桌面客户端' : '浏览器' }}</small>
              </div>
              <div class="sync-mode-box">
                <p class="hint-line">正文边写边存本机，关闭窗口时自动生成快照；异常退出后重新打开即可恢复。</p>
              </div>
            </section>

            <section class="settings-card local-backup-card">
              <div class="settings-card-title">
                <i class="fa-solid fa-database"></i>
                <strong>本地备份</strong>
              </div>
              <div class="backup-form-grid">
                <label class="field-line wide">
                  <span>备份目录</span>
                  <div class="path-box">{{ settingsDraft.backupDir || (desktopSupported ? '读取中...' : '桌面客户端支持目录管理') }}</div>
                </label>
                <label class="field-line">
                  <span>自动备份频率</span>
                  <el-select
                    v-model="settingsDraft.backupInterval"
                    size="small"
                    class="settings-inline-select"
                    popper-class="settings-select-popper"
                  >
                    <el-option label="每 10 分钟" value="10m" />
                    <el-option label="每 20 分钟" value="20m" />
                    <el-option label="每 30 分钟" value="30m" />
                  </el-select>
                </label>
                <label class="field-line">
                  <span>保留份数</span>
                  <el-input-number v-model="settingsDraft.backupRetention" :min="1" :max="100" size="small" />
                </label>
              </div>
              <p class="hint-line">备份内容：有改动的章节正文，以及各书的参考数据（大纲/角色/设定/时间线/故事线）。</p>
              <div class="action-row">
                <button class="ink-btn ink-btn-outline" type="button" :disabled="!desktopSupported || loading" @click="changeBackupDir">
                  <i class="fa-solid fa-folder-open"></i> 修改目录
                </button>
                <button class="ink-btn ink-btn-outline" type="button" :disabled="!desktopSupported || loading" @click="openBackupDir">
                  <i class="fa-regular fa-folder-open"></i> 打开目录
                </button>
                <button class="ink-btn ink-btn-primary" type="button" :disabled="!canBackupNow" @click="backupNow">
                  <i v-if="backingUp" class="fa-solid fa-spinner fa-spin"></i>
                  <i v-else class="fa-solid fa-cloud-arrow-up"></i>
                  立即备份
                </button>
              </div>
              <p v-if="backupError" class="error-line">{{ backupError }}</p>
            </section>
          </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getLocalBackupService } from '@/storage/local-backup-service'
import { formatLocaleDateTime } from '@/utils/format'
import { useSettingsCenterCtx } from '../settings-context'

const ctx = useSettingsCenterCtx()
const { settingsDraft, loading } = ctx
const desktopSupported = ctx.desktopSupported
const backupService = getLocalBackupService()

const backingUp = ref(false)
const backupError = ref('')

const canBackupNow = computed(() =>
  Boolean(desktopSupported && settingsDraft.value.backupEnabled && !loading.value && !backingUp.value)
)

const changeBackupDir = async () => {
  const selected = await backupService.chooseBackupDir(settingsDraft.value.backupDir)
  if (!selected) return
  settingsDraft.value.backupDir = selected
}

const openBackupDir = async () => {
  try {
    await backupService.openBackupDir(settingsDraft.value.backupDir)
  } catch (error) {
    console.error('open backup dir failed', error)
    backupError.value = '打开备份目录失败'
  }
}

const backupNow = async () => {
  if (backingUp.value) return
  backingUp.value = true
  backupError.value = ''
  try {
    settingsDraft.value = await backupService.saveSettings(settingsDraft.value)
    const snapshotted = await backupService.snapshotActiveWritingEditor()
    if (!snapshotted) {
      backupError.value = '当前章节保存到本地失败，未执行本地备份'
      return
    }
    const bookId = ctx.bookId.value
    const result = bookId
      ? await backupService.backupCurrentBook(bookId)
      : await backupService.backupAllPendingBooks()
    const referenceSuccess = result.referenceSuccess || 0
    const referenceFailed = result.referenceFailed || []
    if (!result.supported) {
      backupError.value = '本地文件备份仅桌面客户端支持'
    } else if (result.failed.length || referenceFailed.length) {
      const parts: string[] = []
      if (result.failed.length) parts.push(`${result.failed.length} 章（${result.failed[0].message}）`)
      if (referenceFailed.length) parts.push(`${referenceFailed.length} 本参考数据（${referenceFailed[0].message}）`)
      backupError.value = `备份失败：${parts.join('、')}`
    } else if (result.success > 0 || referenceSuccess > 0) {
      settingsDraft.value.lastBackupAt = result.lastBackupAt
      const parts: string[] = []
      if (result.success > 0) parts.push(`${result.success} 章`)
      if (referenceSuccess > 0) parts.push(`${referenceSuccess} 本参考数据`)
      ElMessage.success(`已备份 ${parts.join('、')}`)
    } else {
      ElMessage.info('没有需要备份的新内容')
    }
  } catch (error) {
    console.error('manual backup failed', error)
    backupError.value = error instanceof Error ? error.message : '立即备份失败'
  } finally {
    backingUp.value = false
  }
}
</script>
