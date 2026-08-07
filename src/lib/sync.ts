import type { AppSettings, PairItem, TextItem, Topic } from '@/types'
import { buildSnapshot, ensureIds, parseSnapshot } from './importExport'
import { isWebDAVConfigured, webdavPull, webdavPush } from './webdav'
import { appStore, topicsAtom, settingsAtom, syncAllTopics, replaceAllTopics } from '@/store/atoms'

/**
 * WebDAV 同步逻辑
 * - syncPull: 启动时拉取远程数据替换本地
 * - syncPush: 修改后拉取远程 → 合并 → 推送 → 更新本地
 * - 合并策略: 按 ID 取并集，本地优先（本地为最新修改）
 */

/** 按 ID 合并两份专题列表（local 与 remote 的并集，local 优先） */
function mergeTopics(local: Topic[], remote: Topic[]): Topic[] {
  const map = new Map<string, Topic>()

  // 先放入 remote
  for (const t of remote) map.set(t.id, t)

  // 合并 local
  for (const t of local) {
    const existing = map.get(t.id)
    if (!existing) {
      map.set(t.id, t)
      continue
    }
    // 同 ID 专题：合并 pairs 和 texts（local 优先）
    const pairMap = new Map<string, PairItem>()
    for (const p of existing.pairs) pairMap.set(p.id, p)
    for (const p of t.pairs) pairMap.set(p.id, p) // local 覆盖 remote

    const textMap = new Map<string, TextItem>()
    for (const tx of existing.texts) textMap.set(tx.id, tx)
    for (const tx of t.texts) textMap.set(tx.id, tx)

    map.set(t.id, {
      ...t, // local 的 name/type 优先
      pairs: Array.from(pairMap.values()),
      texts: Array.from(textMap.values()),
    })
  }

  return Array.from(map.values())
}

/** 同步锁：防止同步过程中订阅回调重复触发 */
let syncing = false

export function isSyncing(): boolean {
  return syncing
}

/** 启动时拉取：从 WebDAV 拉取数据替换本地 */
export async function syncPull(settings: AppSettings): Promise<void> {
  if (!isWebDAVConfigured(settings)) return

  syncing = true
  try {
    const content = await webdavPull(settings)
    if (!content) return // 远程无文件，跳过
    const result = parseSnapshot(JSON.parse(content))
    if (!result.ok || !result.data) return
    const normalized = ensureIds(result.data)
    await replaceAllTopics(normalized.topics)
  } finally {
    syncing = false
  }
}

/** 修改后推送：拉取远程 → 合并 → 推送 → 更新本地 */
export async function syncPush(settings: AppSettings): Promise<void> {
  if (!isWebDAVConfigured(settings)) return

  syncing = true
  try {
    const localTopics = appStore.get(topicsAtom)

    // 1. 拉取远程
    let remoteTopics: Topic[] = []
    try {
      const content = await webdavPull(settings)
      if (content) {
        const result = parseSnapshot(JSON.parse(content))
        if (result.ok && result.data) {
          remoteTopics = ensureIds(result.data).topics
        }
      }
    } catch {
      // 拉取失败时仍用本地推送
    }

    // 2. 合并
    const merged = mergeTopics(localTopics, remoteTopics)

    // 3. 推送
    const snapshot = buildSnapshot(merged)
    await webdavPush(settings, JSON.stringify(snapshot, null, 2))

    // 4. 更新本地（保留活动专题选择）
    await syncAllTopics(merged)
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
