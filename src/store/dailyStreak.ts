import { atom, createStore } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import {
  DAILY_BULK_REPAIR_COST,
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

/** 批量补签结果 */
export interface BulkRepairResult {
  ok: boolean
  /** 实际补签的天数 */
  count: number
  /** 消耗积分（成功时为 DAILY_BULK_REPAIR_COST） */
  cost: number
  /** 失败原因（ok=false 时）：'insufficient' 积分不足 | 'noMissing' 该月没有可补签日期 */
  reason?: 'insufficient' | 'noMissing'
}

/**
 * 批量补签整月：一次性消耗 13520 积分，将目标月「今天之前」所有未打卡日期标记为批量补签
 * - 跳过今天及未来日期（当天未结束，靠正常答题完成）
 * - 跳过已完成打卡的日期（含激冻/补签/批量补签）
 * - 积分不足或该月无可补签日期时返回失败原因
 */
export function bulkRepairMonth(
  store: JotaiStore,
  year: number,
  month: number,
): BulkRepairResult {
  const today = formatLocalDate()
  const daysInMonth = new Date(year, month, 0).getDate()
  let logs = store.get(dayLogsAtom)
  const dates: string[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    const date = formatLocalDate(new Date(year, month - 1, d))
    if (date >= today) continue
    if (logs[date]?.completed) continue
    dates.push(date)
  }
  if (dates.length === 0) {
    return { ok: false, count: 0, cost: DAILY_BULK_REPAIR_COST, reason: 'noMissing' }
  }
  const pts = store.get(pointsAtom)
  if (pts.points < DAILY_BULK_REPAIR_COST) {
    return { ok: false, count: 0, cost: DAILY_BULK_REPAIR_COST, reason: 'insufficient' }
  }

  store.set(pointsAtom, { ...pts, points: pts.points - DAILY_BULK_REPAIR_COST })
  dates.forEach((date, i) => {
    logs = upsertDayLog(logs, date, {
      completed: true,
      repairType: 'bulk',
      // 整月打包成本记录在该月第一个被补签的日期上（月统计合计即 13520）
      pointsSpent:
        (logs[date]?.pointsSpent ?? 0) +
        (i === 0 ? DAILY_BULK_REPAIR_COST : 0),
    })
  })
  store.set(dayLogsAtom, logs)
  return { ok: true, count: dates.length, cost: DAILY_BULK_REPAIR_COST }
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
