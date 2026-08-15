import { useAtomValue } from 'jotai'
import { dailyStreakAtom, dayLogsAtom } from '@/store/dailyStreak'
import { deriveStreakDays, formatLocalDate } from '@/lib/dailyStreak'

/**
 * 订阅每日打卡状态（用于顶栏展示）
 * - streakDays：连续完成天数，由打卡日志推导（已断则返回 0）
 * - todayCorrect：今日累计答对题数
 */
export function useDailyStreakValue() {
  const state = useAtomValue(dailyStreakAtom)
  const logs = useAtomValue(dayLogsAtom)
  const today = formatLocalDate()
  return {
    streakDays: deriveStreakDays(logs, today),
    todayCorrect: state.countDate === today ? state.todayCorrect : 0,
  }
}
