import { atomWithStorage } from 'jotai/utils'

/**
 * 本地快照最后修改时间戳（毫秒）
 * 任何题库 / 积分 / 连胜变化都会更新它，用于 WebDAV last-write-wins 同步。
 */
export const snapshotUpdatedAtAtom = atomWithStorage<number>(
  'echo:snapshot-updated-at',
  0,
)
