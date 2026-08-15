import { describe, expect, it } from 'vitest'
import { getDayStart4AM, isStreakValid, rewardForStreak } from '@/lib/points'

describe('rewardForStreak', () => {
  it('初始 5 分，每连对 +1，上限 10', () => {
    expect(rewardForStreak(1)).toBe(5)
    expect(rewardForStreak(2)).toBe(6)
    expect(rewardForStreak(3)).toBe(7)
    expect(rewardForStreak(4)).toBe(8)
    expect(rewardForStreak(5)).toBe(9)
    expect(rewardForStreak(6)).toBe(10)
    expect(rewardForStreak(7)).toBe(10)
    expect(rewardForStreak(100)).toBe(10)
  })
})

describe('getDayStart4AM', () => {
  it('凌晨 4 点之前，起点是昨天 4 点', () => {
    const now = new Date(2024, 0, 15, 3, 0, 0).getTime()
    const dayStart = new Date(2024, 0, 14, 4, 0, 0).getTime()
    expect(getDayStart4AM(now)).toBe(dayStart)
  })

  it('凌晨 4 点及之后，起点是当天 4 点', () => {
    const at4 = new Date(2024, 0, 15, 4, 0, 0).getTime()
    expect(getDayStart4AM(at4)).toBe(at4)

    const late = new Date(2024, 0, 15, 23, 59, 59).getTime()
    expect(getDayStart4AM(late)).toBe(at4)
  })
})

describe('isStreakValid', () => {
  it('无上次答对时间 → 失效', () => {
    expect(isStreakValid(null)).toBe(false)
  })

  it('同一 4 点日内 → 有效', () => {
    const last = new Date(2024, 0, 15, 4, 0, 0).getTime()
    const now = new Date(2024, 0, 15, 5, 0, 0).getTime()
    expect(isStreakValid(last, now)).toBe(true)
  })

  it('跨过凌晨 4 点 → 失效', () => {
    const last = new Date(2024, 0, 15, 3, 59, 59).getTime()
    const now = new Date(2024, 0, 15, 4, 0, 0).getTime()
    expect(isStreakValid(last, now)).toBe(false)
  })
})
