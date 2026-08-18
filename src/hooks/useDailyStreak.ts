import { useAtomValue } from 'jotai'
import { dailyStreakAtom, dayLogsAtom } from '@/store/dailyStreak'
import { deriveStreakDays, formatLocalDate } from '@/lib/dailyStreak'

/**
 * 订阅每日打卡状态（用于顶栏展示）
 * - streakDays：连续完成天数，由打卡日志推导（已断则返回 0）
 * - todayCorrect：今日累计答对题数
 * - todayCompleted：今天是否已完成打卡（用于顶栏火焰颜色：未打卡灰色、已打卡按连胜上色）
 */
export function useDailyStreakValue() {
  const state = useAtomValue(dailyStreakAtom)
  const logs = useAtomValue(dayLogsAtom)
  const today = formatLocalDate()
  return {
    streakDays: deriveStreakDays(logs, today),
    todayCorrect: state.countDate === today ? state.todayCorrect : 0,
    todayCompleted: logs[today]?.completed === true,
  }
}
