import { useCallback, useEffect, useRef } from 'react'
import { useAtomValue, useSetAtom, useStore } from 'jotai'
import { pointsAtom } from '@/store/points'
import { recordDailyCorrectToStore } from '@/store/dailyStreak'
import { isStreakValid, rewardForStreak } from '@/lib/points'

/**
 * 连续答错扣分规则：
 * - 连续答错达到 5 题开始扣分，扣分从 3 起，每多错 1 题多扣 1 分，最多 8 分
 */
export function wrongPenalty(wrongStreak: number): number {
  if (wrongStreak < 5) return 0
  return Math.min(3 + (wrongStreak - 5), 8)
}

/**
 * 积分记录器（不订阅积分值，避免无关重渲染）
 *
 * `queueResult` 用于在引擎的 setState updater 里标记本次判定结果（correct: boolean）。
 * 由于 React StrictMode 会双调 updater，这里用 ref 暂存，再在 effect 中统一消费，
 * 确保每次判定只记录一次积分。
 * - 答对：按连对累加积分；答错：累计连续答错计数，达到阈值后扣分
 */
export function usePointsRecorder() {
  const store = useStore()
  const setPoints = useSetAtom(pointsAtom)
  const pendingRef = useRef<boolean | null>(null)

  const queueResult = useCallback((correct: boolean) => {
    pendingRef.current = correct
  }, [])

  useEffect(() => {
    const pending = pendingRef.current
    if (pending === null) return
    pendingRef.current = null
    setPoints((prev) => {
      if (!pending) {
        // 答错：清零连续答对计数，累计连续答错（达到 5 题后开始扣分，可为负数）
        const wrongStreak = prev.wrongStreak + 1
        const penalty = wrongPenalty(wrongStreak)
        return {
          ...prev,
          streak: 0,
          wrongStreak,
          points: prev.points - penalty,
        }
      }
      // 答对：按连续答对累加积分，并更新时间戳，重置连续答错计数
      const now = Date.now()
      const streak = isStreakValid(prev.lastCorrectAt, now)
        ? prev.streak + 1
        : 1
      return {
        points: prev.points + rewardForStreak(streak),
        streak,
        lastCorrectAt: now,
        wrongStreak: 0,
      }
    })
    // 每日打卡（仅答对时累计：今日进度 + 当日日志）
    if (pending) {
      recordDailyCorrectToStore(store, Date.now())
    }
  })

  return { queueResult }
}

/** 订阅积分状态（用于展示） */
export function usePointsValue() {
  const state = useAtomValue(pointsAtom)
  return { points: state.points, streak: state.streak }
}
