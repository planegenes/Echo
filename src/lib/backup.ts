import type { AppSettings, Topic } from '@/types'
import type { PointsState } from '@/store/points'
import type { DailyStreakState, DayLogs } from '@/lib/dailyStreak'

/**
 * 完整备份（与 WebDAV 同步快照不同）
 * - WebDAV 快照：仅题库 + 积分/打卡，用于多端同步
 * - 完整备份：题库 + 积分/打卡 + 应用设置（含 AI 供应商、WebDAV 凭据等），
 *   导出到本地文件，用于数据保全与迁移
 */

export interface BackupFile {
  /** 标识符，与 WebDAV 快照区分 */
  format: 'echo-backup'
  version: 1
  exportedAt: number
  topics: Topic[]
  points?: PointsState
  dailyStreak?: DailyStreakState
  dayLogs?: DayLogs
  settings?: AppSettings
}

/** 组装完整备份对象 */
export function buildBackup(
  topics: Topic[],
  points?: PointsState,
  dailyStreak?: DailyStreakState,
  dayLogs?: DayLogs,
  settings?: AppSettings,
): BackupFile {
  return {
    format: 'echo-backup',
    version: 1,
    exportedAt: Date.now(),
    topics,
    points,
    dailyStreak,
    dayLogs,
    settings,
  }
}

/** 解析备份 JSON，校验格式与基本结构 */
export function parseBackup(input: unknown):
  | { ok: true; data: BackupFile }
  | { ok: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: '备份内容不是有效 JSON 对象' }
  }
  const obj = input as Record<string, unknown>
  if (obj.format !== 'echo-backup') {
    return { ok: false, error: '不是回响备份文件（format 应为 echo-backup）' }
  }
  if (!Array.isArray(obj.topics)) {
    return { ok: false, error: '备份缺少 topics 数组' }
  }
  return {
    ok: true,
    data: obj as unknown as BackupFile,
  }
}

/** 下载备份为 JSON 文件 */
export function downloadBackup(backup: BackupFile): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const date = new Date(backup.exportedAt)
    .toISOString()
    .slice(0, 10)
  a.download = `echo-backup-${date}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
