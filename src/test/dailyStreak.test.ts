import { describe, expect, it } from 'vitest'
import {
  DAILY_TARGET,
  dayBeforeYesterdayStr,
  dayStatus,
  deriveStreakDays,
  formatLocalDate,
  getMonthStats,
  prevDate,
  recordDailyCorrect,
  upsertDayLog,
  yesterdayStr,
  type DailyStreakState,
  type DayLog,
  type DayLogs,
} from '@/lib/dailyStreak'

function emptyState(): DailyStreakState {
  return { todayCorrect: 0, countDate: null }
}

function mkLog(date: string, patch: Partial<DayLog> = {}): DayLog {
  return {
    date,
    answered: false,
    completed: false,
    pointsSpent: 0,
    repaired: false,
    ...patch,
  }
}

describe('日期工具', () => {
  it('formatLocalDate 输出 YYYY-MM-DD', () => {
    expect(formatLocalDate(new Date(2024, 0, 5))).toBe('2024-01-05')
  })

  it('prevDate / yesterdayStr / dayBeforeYesterdayStr', () => {
    expect(prevDate('2024-01-15')).toBe('2024-01-14')
    expect(yesterdayStr('2024-01-15')).toBe('2024-01-14')
    expect(dayBeforeYesterdayStr('2024-01-15')).toBe('2024-01-13')
  })
})

describe('recordDailyCorrect', () => {
  it('未达目标时不触发完成', () => {
    const now = new Date(2024, 0, 15, 12, 0, 0).getTime()
    const { state, reachedTarget } = recordDailyCorrect(emptyState(), now)
    expect(state).toEqual({ todayCorrect: 1, countDate: '2024-01-15' })
    expect(reachedTarget).toBe(false)
  })

  it('达到每日目标后 reachedTarget = true', () => {
    let state = emptyState()
    const now = new Date(2024, 0, 15, 12, 0, 0).getTime()
    let reached = false
    for (let i = 0; i < DAILY_TARGET; i++) {
      const r = recordDailyCorrect(state, now)
      state = r.state
      reached = r.reachedTarget
    }
    expect(state.todayCorrect).toBe(DAILY_TARGET)
    expect(reached).toBe(true)
  })

  it('跨天重置今日计数', () => {
    const state: DailyStreakState = { todayCorrect: 5, countDate: '2024-01-14' }
    const now = new Date(2024, 0, 15, 12, 0, 0).getTime()
    const r = recordDailyCorrect(state, now)
    expect(r.state).toEqual({ todayCorrect: 1, countDate: '2024-01-15' })
    expect(r.reachedTarget).toBe(false)
  })
})

describe('upsertDayLog', () => {
  it('新建记录并填充默认值', () => {
    const logs = upsertDayLog({}, '2024-01-15', { answered: true })
    expect(logs['2024-01-15']).toEqual(mkLog('2024-01-15', { answered: true }))
  })

  it('合并更新保留已有字段', () => {
    let logs = upsertDayLog({}, '2024-01-15', { answered: true })
    logs = upsertDayLog(logs, '2024-01-15', { completed: true })
    expect(logs['2024-01-15']).toEqual(
      mkLog('2024-01-15', { answered: true, completed: true }),
    )
  })
})

describe('dayStatus', () => {
  it('状态优先级：完成 > 答题 > 无；修复/补签不单独区分', () => {
    expect(dayStatus(undefined)).toBe('none')
    expect(dayStatus(mkLog('2024-01-15', { answered: true }))).toBe('answered')
    expect(dayStatus(mkLog('2024-01-15', { completed: true }))).toBe('completed')
    // 修复/补签过的日子同样显示为完整打卡
    expect(
      dayStatus(mkLog('2024-01-15', { completed: true, repaired: true })),
    ).toBe('completed')
  })
})

describe('deriveStreakDays', () => {
  const done = (date: string): DayLogs => ({
    [date]: mkLog(date, { answered: true, completed: true }),
  })

  it('空日志 → 0', () => {
    expect(deriveStreakDays({}, '2024-01-15')).toBe(0)
  })

  it('今天完成 → 从今天往回数', () => {
    const logs: DayLogs = {
      ...done('2024-01-13'),
      ...done('2024-01-14'),
      ...done('2024-01-15'),
    }
    expect(deriveStreakDays(logs, '2024-01-15')).toBe(3)
  })

  it('今天未完成但昨天完成 → 从昨天往回数', () => {
    const logs: DayLogs = {
      ...done('2024-01-13'),
      ...done('2024-01-14'),
    }
    expect(deriveStreakDays(logs, '2024-01-15')).toBe(2)
  })

  it('中间断一天则中断', () => {
    const logs: DayLogs = {
      ...done('2024-01-13'),
      ...done('2024-01-15'),
    }
    expect(deriveStreakDays(logs, '2024-01-15')).toBe(1)
  })

  it('前天完成但昨天没完成 → 已断', () => {
    const logs = done('2024-01-13')
    expect(deriveStreakDays(logs, '2024-01-15')).toBe(0)
  })

  it('修复打卡（completed + repaired）同样计入连胜', () => {
    const logs: DayLogs = {
      ...done('2024-01-14'),
      '2024-01-15': mkLog('2024-01-15', {
        completed: true,
        repaired: true,
        pointsSpent: 50,
      }),
    }
    expect(deriveStreakDays(logs, '2024-01-15')).toBe(2)
  })
})

describe('getMonthStats', () => {
  it('统计当月各类天数与积分消耗', () => {
    const logs: DayLogs = {
      '2024-01-01': mkLog('2024-01-01', {
        answered: true,
        completed: true,
      }),
      '2024-01-02': mkLog('2024-01-02', {
        completed: true,
        repaired: true,
        pointsSpent: 50,
      }),
      '2024-01-03': mkLog('2024-01-03', { answered: true }),
    }
    // 2024-01-15 是今天：1~14 为过去，15 为今天，16~31 为未来
    const stats = getMonthStats(logs, 2024, 1, '2024-01-15')
    expect(stats.completedDays).toBe(2)
    expect(stats.repairedDays).toBe(1)
    expect(stats.answeredOnlyDays).toBe(1)
    expect(stats.pointsSpent).toBe(50)
    // 过去 14 天中 3 天有记录 → 11 天未答题（今天 15 不算 missed）
    expect(stats.missedDays).toBe(11)
  })

  it('未来日期不计入未答题', () => {
    const stats = getMonthStats({}, 2024, 1, '2024-01-15')
    expect(stats.missedDays).toBe(14)
    expect(stats.completedDays).toBe(0)
  })
})
