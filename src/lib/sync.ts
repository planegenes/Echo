import type { AppSettings, Snapshot } from '@/types'
import { buildSnapshot, ensureIds, parseSnapshot } from './importExport'
import { isWebDAVConfigured, webdavPull, webdavPush } from './webdav'
import {
  appStore,
  topicsAtom,
  settingsAtom,
  replaceAllTopics,
} from '@/store/atoms'
import { pointsAtom } from '@/store/points'
import { dailyStreakAtom, dayLogsAtom } from '@/store/dailyStreak'
import { snapshotUpdatedAtAtom } from '@/store/sync'

/**
 * WebDAV 同步逻辑（快照 + last-write-wins）
 * - 快照含 updatedAt 时间戳，本地用 snapshotUpdatedAtAtom 记录最后修改时间
 * - syncPull：启动时拉取远程，若远程更新则覆盖本地
 * - syncPush：修改后拉取远程，若远程更新则覆盖本地，否则推送本地
 * - 合并策略：以「较新的一份」为准（不是逐字段合并）
 */

/** 同步锁：防止同步过程中订阅回调重复触发 */
let syncing = false

export function isSyncing(): boolean {
  return syncing
}

/** 用远程快照整体覆盖本地（题库 + 积分 + 连胜 + 打卡日志 + 时间戳） */
async function applyRemote(remote: Snapshot): Promise<void> {
  await replaceAllTopics(remote.topics)
  if (remote.points) appStore.set(pointsAtom, remote.points)
  if (remote.dailyStreak) appStore.set(dailyStreakAtom, remote.dailyStreak)
  if (remote.dayLogs) appStore.set(dayLogsAtom, remote.dayLogs)
  appStore.set(snapshotUpdatedAtAtom, remote.updatedAt ?? 0)
}

/** 启动时拉取：若远程比本地新，则用远程覆盖本地 */
export async function syncPull(settings: AppSettings): Promise<void> {
  if (!isWebDAVConfigured(settings)) return

  syncing = true
  try {
    const content = await webdavPull(settings)
    if (!content) return // 远程无文件，跳过
    const result = parseSnapshot(JSON.parse(content))
    if (!result.ok || !result.data) return
    const remote = ensureIds(result.data)
    const remoteUpdatedAt = remote.updatedAt ?? 0
    const localUpdatedAt = appStore.get(snapshotUpdatedAtAtom)

    if (remoteUpdatedAt > localUpdatedAt) {
      await applyRemote(remote)
    }
  } finally {
    syncing = false
  }
}

/** 修改后推送：比较本地/远程时间戳，较新的一份为准 */
export async function syncPush(settings: AppSettings): Promise<void> {
  if (!isWebDAVConfigured(settings)) return

  syncing = true
  try {
    const localUpdatedAt = appStore.get(snapshotUpdatedAtAtom)

    // 1. 拉取远程
    let remote: Snapshot | null = null
    try {
      const content = await webdavPull(settings)
      if (content) {
        const result = parseSnapshot(JSON.parse(content))
        if (result.ok && result.data) remote = ensureIds(result.data)
      }
    } catch {
      // 拉取失败时仍用本地推送
    }

    // 2. 远程更新 → 用远程覆盖本地
    if (remote && (remote.updatedAt ?? 0) > localUpdatedAt) {
      await applyRemote(remote)
      return
    }

    // 3. 本地更新（或远程不存在）→ 推送本地
    const localTopics = appStore.get(topicsAtom)
    const localPoints = appStore.get(pointsAtom)
    const localDailyStreak = appStore.get(dailyStreakAtom)
    const localDayLogs = appStore.get(dayLogsAtom)
    const snapshot = buildSnapshot(
      localTopics,
      localPoints,
      localDailyStreak,
      localDayLogs,
      localUpdatedAt,
    )
    await webdavPush(settings, JSON.stringify(snapshot, null, 2))
  } finally {
    syncing = false
  }
}

/** 防抖推送（2 秒内多次修改只触发一次） */
let pushTimer: ReturnType<typeof setTimeout> | null = null
const PUSH_DEBOUNCE_MS = 2000

/** 安排一次防抖推送 */
export function scheduleSyncPush(): void {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    const settings = appStore.get(settingsAtom)
    if (isSyncing()) return
    if (!isWebDAVConfigured(settings)) return
    void syncPush(settings).catch((e) =>
      console.warn('[WebDAV] 推送失败:', e),
    )
  }, PUSH_DEBOUNCE_MS)
}
