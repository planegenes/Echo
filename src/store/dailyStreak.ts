import { atom, createStore } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import {
  DAILY_STREAK_REPAIR_COST,
  canRepairDate,
  dayBeforeYesterdayStr,
  dayStatus,
  deriveStreakDays,
  formatLocalDate,
  recordDailyCorrect,
  repairCostFor,
  repairKindFor,
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

/** 连错 ≥10 取消当天正常打卡的提示弹窗开关 */
export const completionCanceledAtom = atom<boolean>(false)

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
  const reCompleted = (logs[today]?.completed ?? false) || reachedTarget
  store.set(
    dayLogsAtom,
    upsertDayLog(logs, today, {
      answered: true,
      completed: reCompleted,
      // 重新达成目标后清除「连错取消」标记，恢复为正常打卡（含激冻/补签恢复时保留 repairType）
      canceled: reCompleted ? undefined : logs[today]?.canceled,
    }),
  )
}

/**
 * 日历中手动连胜激冻一天（点击月/年历上的可补签日期）
 * - 仅当该日满足 canRepairDate（其后直到昨天都已打卡）时允许
 * - 消耗积分：连胜激冻 233，补签 648（repairCostFor）
 * - 标记为「修复打卡」，返回是否成功
 */
export function repairDateOnCalendar(store: JotaiStore, date: string): boolean {
  const today = formatLocalDate()
  const logs = store.get(dayLogsAtom)
  if (!canRepairDate(logs, date, today)) return false
  const cost = repairCostFor(logs, date, today)
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
      // 昨天且前天已打卡 = 连胜激冻，其余 = 补签
      repairType: repairKindFor(logs, date, today),
      pointsSpent: (logs[date]?.pointsSpent ?? 0) + cost,
    }),
  )
  return true
}

/**
 * 连错惩罚：取消当天「正常」打卡（标记为 canceled 新类型，日历中以独立颜色区分）
 * - 仅当天有「正常」打卡（completed 且非激冻/补签）时生效，幂等
 * - 取消同时重置今日答对计数：需重新答对 10 题才能再次打卡
 * - 返回是否成功取消（供调用方决定是否弹提示）
 */
export function cancelTodayCompletion(store: JotaiStore): boolean {
  const today = formatLocalDate()
  const logs = store.get(dayLogsAtom)
  if (dayStatus(logs[today]) !== 'completed') return false
  store.set(
    dayLogsAtom,
    upsertDayLog(logs, today, { completed: false, canceled: true }),
  )
  // 重置今日答对计数：需重新答对 10 题才能再次打卡
  store.set(dailyStreakAtom, { todayCorrect: 0, countDate: today })
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
