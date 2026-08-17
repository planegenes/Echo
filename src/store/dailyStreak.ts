import { atom, createStore } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import {
  DAILY_STREAK_REPAIR_COST,
  canRepairDate,
  dayBeforeYesterdayStr,
  deriveStreakDays,
  formatLocalDate,
  recordDailyCorrect,
  repairCostFor,
  upsertDayLog,
  yesterdayStr,
  type DailyStreakState,
  type DayLogs,
} from '@/lib/dailyStreak'
import { pointsAtom } from '@/store/points'

/**
 * 每日打卡状态（持久化到 localStorage）
 * - dailyStreakAtom：仅今日进度标量（顶栏实时展示用）
 * - dayLogsAtom：每日打卡日志，历史明细与连胜均由它推导
 */
export const dailyStreakAtom = atomWithStorage<DailyStreakState>(
  'echo:daily-streak',
  { todayCorrect: 0, countDate: null },
)

export const dayLogsAtom = atomWithStorage<DayLogs>('echo:day-logs', {})

/** 修复连胜的弹框数据 */
export interface RepairDialogData {
  cost: number
  streakDays: number
}

export const repairDialogAtom = atom<RepairDialogData | null>(null)

type JotaiStore = ReturnType<typeof createStore>

/** 旧版标量结构的字段（仅用于迁移读取） */
interface LegacyDailyStreak {
  streakDays?: number
  lastCompletedDate?: string | null
  todayCorrect?: number
  countDate?: string | null
}

/**
 * 迁移旧版数据：把 lastCompletedDate 落成一条「正常打卡」日志。
 * 旧版无法区分是否修复过，因此 migrated 记录 repairType 缺省（正常打卡）。
 */
function migrateLegacyStreak(store: JotaiStore): void {
  const legacy = store.get(dailyStreakAtom) as unknown as LegacyDailyStreak
  const last = legacy.lastCompletedDate
  if (!last) return
  const logs = store.get(dayLogsAtom)
  if (!logs[last]) {
    store.set(
      dayLogsAtom,
      upsertDayLog(logs, last, { answered: true, completed: true }),
    )
  }
  store.set(dailyStreakAtom, {
    todayCorrect: legacy.todayCorrect ?? 0,
    countDate: legacy.countDate ?? null,
  })
}

/**
 * 答对一题：更新今日进度标量 + 当日日志
 * - 当天首次答题 → answered = true
 * - 达到每日目标且当天尚未完成 → completed = true
 */
export function recordDailyCorrectToStore(store: JotaiStore, now: number): void {
  const prev = store.get(dailyStreakAtom)
  const { state, reachedTarget } = recordDailyCorrect(prev, now)
  store.set(dailyStreakAtom, state)

  const today = formatLocalDate(new Date(now))
  const logs = store.get(dayLogsAtom)
  store.set(
    dayLogsAtom,
    upsertDayLog(logs, today, {
      answered: true,
      completed: (logs[today]?.completed ?? false) || reachedTarget,
    }),
  )
}

/**
 * 日历中手动连胜激冻一天（点击月/年历上的可补签日期）
 * - 仅当该日满足 canRepairDate（其后直到昨天都已打卡）时允许
 * - 消耗积分：昨天 233，更早 648（repairCostFor）
 * - 标记为「修复打卡」，返回是否成功
 */
export function repairDateOnCalendar(store: JotaiStore, date: string): boolean {
  const today = formatLocalDate()
  const logs = store.get(dayLogsAtom)
  if (!canRepairDate(logs, date, today)) return false
  const cost = repairCostFor(date, today)
  const pts = store.get(pointsAtom)
  if (pts.points < cost) return false

  store.set(pointsAtom, {
    ...pts,
    points: pts.points - cost,
  })
  store.set(
    dayLogsAtom,
    upsertDayLog(logs, date, {
      completed: true,
      // 昨天 = 连胜激冻，更早 = 补签
      repairType: date === yesterdayStr(today) ? 'freeze' : 'repair',
      pointsSpent: (logs[date]?.pointsSpent ?? 0) + cost,
    }),
  )
  return true
}

/**
 * 启动时检查每日打卡：
 * - 今天或昨天已完成 → 连胜有效，不做处理
 * - 漏了昨天一天（前天已完成）→ 若有足够积分则自动修复，昨天记为「修复打卡」并弹框
 * - 更早或从未完成 → 连胜已断（日志保留原样，派生值自然为 0）
 */
export function checkDailyStreakOnOpen(store: JotaiStore): void {
  migrateLegacyStreak(store)

  const today = formatLocalDate()
  const yesterday = yesterdayStr(today)
  const dayBefore = dayBeforeYesterdayStr(today)
  let logs = store.get(dayLogsAtom)
  const pts = store.get(pointsAtom)

  // 连胜有效：今天或昨天已完成
  if (logs[today]?.completed || logs[yesterday]?.completed) return

  // 漏了昨天（前天已完成）→ 尝试用积分修复
  if (logs[dayBefore]?.completed) {
    if (pts.points >= DAILY_STREAK_REPAIR_COST) {
      store.set(pointsAtom, {
        ...pts,
        points: pts.points - DAILY_STREAK_REPAIR_COST,
      })
      logs = upsertDayLog(logs, yesterday, {
        completed: true,
        repairType: 'freeze',
        pointsSpent:
          (logs[yesterday]?.pointsSpent ?? 0) + DAILY_STREAK_REPAIR_COST,
      })
      store.set(dayLogsAtom, logs)
      store.set(repairDialogAtom, {
        cost: DAILY_STREAK_REPAIR_COST,
        streakDays: deriveStreakDays(logs, today),
      })
    }
    return
  }

  // 更早或从未完成 → 连胜已断，无需重置（日志保留，派生值自然为 0）
}
