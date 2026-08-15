/**
 * 积分与连续答对逻辑（纯函数）
 * - 答对奖励：初始 5，每连续答对一道 +1，上限 10
 * - 连续答对计数在每日凌晨 4 点之后失效（视为「新一天」）
 */

/** 连续答对「新一天」的分界小时 */
const STREAK_RESET_HOUR = 4

/** 答对奖励的初始值与上限 */
const REWARD_BASE = 5
const REWARD_CAP = 10

/** 计算当前时刻所处的「4 点日」起点时间戳（毫秒） */
export function getDayStart4AM(now: number = Date.now()): number {
  const d = new Date(now)
  d.setHours(STREAK_RESET_HOUR, 0, 0, 0)
  // 若当前在 0~4 点之间，则「新一天」从昨天的 4 点开始
  if (now < d.getTime()) {
    d.setDate(d.getDate() - 1)
  }
  return d.getTime()
}

/** 根据连续答对数量计算本次得分（5 起，每连对 +1，上限 10） */
export function rewardForStreak(streak: number): number {
  return Math.min(REWARD_BASE + (streak - 1), REWARD_CAP)
}

/** 判断连续答对是否仍有效（上次答对时间在同一「4 点日」内） */
export function isStreakValid(
  lastCorrectAt: number | null,
  now: number = Date.now(),
): boolean {
  if (lastCorrectAt == null) return false
  return lastCorrectAt >= getDayStart4AM(now)
}
