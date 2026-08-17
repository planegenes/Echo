import { atomWithStorage } from 'jotai/utils'

/**
 * 积分与答题状态（持久化到 localStorage）
 */
export interface PointsState {
  /** 累计积分 */
  points: number
  /** 当前连续答对计数 */
  streak: number
  /** 上次答对时间戳（用于每日凌晨 4 点失效判断） */
  lastCorrectAt: number | null
  /** 当前连续答错计数（>=5 后开始扣分） */
  wrongStreak: number
}

export const pointsAtom = atomWithStorage<PointsState>('echo:points', {
  points: 0,
  streak: 0,
  lastCorrectAt: null,
  wrongStreak: 0,
})
