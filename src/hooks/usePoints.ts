import { useCallback, useEffect, useRef } from 'react'
import { useAtomValue, useSetAtom, useStore } from 'jotai'
import { pointsAtom } from '@/store/points'
import { recordDailyCorrectToStore } from '@/store/dailyStreak'
import { isStreakValid, rewardForStreak } from '@/lib/points'

/**
 * 积分记录器（不订阅积分值，避免无关重渲染）
 *
 * `queueResult` 用于在引擎的 setState updater 里标记本次判定结果（correct: boolean）。
 * 由于 React StrictMode 会双调 updater，这里用 ref 暂存，再在 effect 中统一消费，
 * 确保每次判定只记录一次积分。
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
        // 答错：清零连续答对计数
        return prev.streak === 0 ? prev : { ...prev, streak: 0 }
      }
      // 答对：按连续答对累加积分，并更新时间戳
      const now = Date.now()
      const streak = isStreakValid(prev.lastCorrectAt, now)
        ? prev.streak + 1
        : 1
      return {
        points: prev.points + rewardForStreak(streak),
        streak,
        lastCorrectAt: now,
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
