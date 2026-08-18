/**
 * 每日打卡日志逻辑（纯函数）
 * - 单日答对 10 题视为「完成一天」
 * - 每个「有事件的日子」落一条 DayLog（没答题的日子不落记录，缺失即未答）
 * - 连续答题天数由日志推导（不再单独存储）
 * - 漏一天可用积分修复，被修复的日子记为「修复打卡」（completed + repaired）
 */

/** 单日完成所需答对题数 */
export const DAILY_TARGET = 10

/** 修复断签（漏一天）所需积分（启动时自动修复） */
export const DAILY_STREAK_REPAIR_COST = 233

/** 日历中手动补签一天所需积分（非连胜激冻的其余历史日期） */
export const DAILY_REPAIR_COST = 648

/**
 * 判定某天手动修复的类型（仅对可修复的未完成日期调用）：
 * - 「连胜激冻」：该天是昨天，且前天已完成打卡（前天不是未答/未打卡）
 * - 否则：「补签」
 */
export function repairKindFor(
  logs: DayLogs,
  date: string,
  todayStr: string,
): 'freeze' | 'repair' {
  const isFreeze =
    date === yesterdayStr(todayStr) &&
    logs[dayBeforeYesterdayStr(todayStr)]?.completed === true
  return isFreeze ? 'freeze' : 'repair'
}

/** 手动修复某天的价格：连胜激冻 233，补签 648 */
export function repairCostFor(
  logs: DayLogs,
  date: string,
  todayStr: string,
): number {
  return repairKindFor(logs, date, todayStr) === 'freeze'
    ? DAILY_STREAK_REPAIR_COST
    : DAILY_REPAIR_COST
}

/** 每日进度标量（仅今日，用于顶栏实时展示） */
export interface DailyStreakState {
  /** 今日累计答对题数 */
  todayCorrect: number
  /** todayCorrect 所属日期（YYYY-MM-DD） */
  countDate: string | null
}

/** 某一天的打卡日志 */
export interface DayLog {
  /** 日期（YYYY-MM-DD），与键一致 */
  date: string
  /** 当天是否答过题（哪怕没完成目标） */
  answered: boolean
  /** 当天是否达成目标（答对 10 题，或靠积分激冻/补签达成） */
  completed: boolean
  /** 当天消耗的积分（连胜激冻 233 / 补签 648） */
  pointsSpent: number
  /** 修复类型：'freeze' 连胜激冻（昨天且前天已打卡，233）、'repair' 补签（其余情况，648）；缺省表示正常打卡 */
  repairType?: 'freeze' | 'repair'
  /** 连错 ≥10 题时被取消的「正常」打卡（日历中以独立颜色区分，不计入连胜） */
  canceled?: boolean
}

/** 打卡日志表：以 YYYY-MM-DD 为键，只存有事件的日子 */
export type DayLogs = Record<string, DayLog>

/** 日历格子的状态类型 */
export type DayStatus =
  | 'completed'
  | 'freeze'
  | 'repair'
  | 'canceled'
  | 'answered'
  | 'none'

/** 本地日期字符串 YYYY-MM-DD */
export function formatLocalDate(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** 某日期字符串的前一天 */
export function prevDate(dateStr: string): string {
  const d = parseLocalDate(dateStr)
  d.setDate(d.getDate() - 1)
  return formatLocalDate(d)
}

/** 某日期字符串的后一天 */
export function nextDate(dateStr: string): string {
  const d = parseLocalDate(dateStr)
  d.setDate(d.getDate() + 1)
  return formatLocalDate(d)
}

/** 昨天（相对 todayStr） */
export function yesterdayStr(todayStr: string): string {
  return prevDate(todayStr)
}

/** 前天（相对 todayStr） */
export function dayBeforeYesterdayStr(todayStr: string): string {
  return prevDate(prevDate(todayStr))
}

/**
 * 某日期是否可手动补签：
 * - 必须是过去的日子（不含今天）且当天未完成打卡
 * - 该日之后的所有日期（直到昨天）都必须已完成打卡——
 *   即它是「从昨天往回数第一个未打卡日」，补签后前一天才可继续补签（递归）
 */
export function canRepairDate(
  logs: DayLogs,
  date: string,
  todayStr: string,
): boolean {
  if (date >= todayStr) return false
  if (logs[date]?.completed) return false
  let cursor = nextDate(date)
  while (cursor < todayStr) {
    if (!logs[cursor]?.completed) return false
    cursor = nextDate(cursor)
  }
  return true
}

/** 新建一条空白日志 */
export function createDayLog(date: string): DayLog {
  return { date, answered: false, completed: false, pointsSpent: 0 }
}

/** upsert：合并更新某天的日志，返回新表（不可变） */
export function upsertDayLog(
  logs: DayLogs,
  date: string,
  patch: Partial<DayLog>,
): DayLogs {
  const cur = logs[date] ?? createDayLog(date)
  return { ...logs, [date]: { ...cur, ...patch, date } }
}

/** 答对一题后更新每日进度标量 */
export function recordDailyCorrect(
  state: DailyStreakState,
  now: number,
): { state: DailyStreakState; reachedTarget: boolean } {
  const today = formatLocalDate(new Date(now))
  let { todayCorrect, countDate } = state

  // 跨天：重置今日计数
  if (countDate !== today) {
    countDate = today
    todayCorrect = 0
  }
  todayCorrect += 1

  return {
    state: { todayCorrect, countDate },
    reachedTarget: todayCorrect >= DAILY_TARGET,
  }
}

/**
 * 某天日志的状态（供热力图着色）：
 * - completed 正常打卡；freeze 连胜激冻；repair 补签；canceled 连错取消；answered 未完成；none 未答题
 * - 兼容旧数据：repaired=true 无 repairType 时按 pointsSpent 推断（>=648 视为补签，否则连胜激冻）
 */
export function dayStatus(log: DayLog | undefined): DayStatus {
  if (!log) return 'none'
  // 连错 ≥10 被取消的打卡（优先于 completed 判断）
  if (log.canceled) return 'canceled'
  if (log.completed) {
    if (log.repairType === 'freeze') return 'freeze'
    if (log.repairType === 'repair') return 'repair'
    // 旧数据兼容
    const legacy = (log as DayLog & { repaired?: boolean }).repaired
    if (legacy) return log.pointsSpent >= DAILY_REPAIR_COST ? 'repair' : 'freeze'
    return 'completed'
  }
  if (log.answered) return 'answered'
  return 'none'
}

/**
 * 由日志推导连续完成天数：
 * - 今天已完成 → 从今天往回数连续 completed 的天数
 * - 今天未完成但昨天已完成 → 从昨天往回数
 * - 否则 → 0（连胜已断）
 */
export function deriveStreakDays(logs: DayLogs, todayStr: string): number {
  const isDone = (date: string) => logs[date]?.completed === true
  let cursor = todayStr
  if (!isDone(cursor)) {
    cursor = prevDate(cursor)
    if (!isDone(cursor)) return 0
  }
  let days = 0
  while (isDone(cursor)) {
    days += 1
    cursor = prevDate(cursor)
  }
  return days
}

/** 日历中的一个格子（dayOfMonth = 0 表示月份前的占位） */
export interface CalendarDay {
  date: string
  dayOfMonth: number
  isToday: boolean
  log?: DayLog
}

/** 生成某月的日历格子（周一开头，前面补齐占位） */
export function getMonthCalendar(
  logs: DayLogs,
  year: number,
  month: number,
  todayStr: string,
): CalendarDay[] {
  const first = new Date(year, month - 1, 1)
  const daysInMonth = new Date(year, month, 0).getDate()
  // 周一开头：周日 → 6，周一 → 0
  const leading = (first.getDay() + 6) % 7
  const cells: CalendarDay[] = []
  for (let i = 0; i < leading; i++) {
    cells.push({ date: '', dayOfMonth: 0, isToday: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = formatLocalDate(new Date(year, month - 1, d))
    cells.push({
      date,
      dayOfMonth: d,
      isToday: date === todayStr,
      log: logs[date],
    })
  }
  return cells
}

/** 某月统计 */
export interface MonthStats {
  /** 完整打卡天数（含激冻/补签） */
  completedDays: number
  /** 连胜激冻天数（昨天，233） */
  freezeDays: number
  /** 补签天数（更早，648） */
  repairDays: number
  /** 连错 ≥10 被取消的打卡天数 */
  canceledDays: number
  /** 答过题但未完成的天数 */
  answeredOnlyDays: number
  /** 过去未答题的天数 */
  missedDays: number
  /** 当月消耗积分合计 */
  pointsSpent: number
}

/** 统计某月的打卡情况 */
export function getMonthStats(
  logs: DayLogs,
  year: number,
  month: number,
  todayStr: string,
): MonthStats {
  const daysInMonth = new Date(year, month, 0).getDate()
  const stats: MonthStats = {
    completedDays: 0,
    freezeDays: 0,
    repairDays: 0,
    canceledDays: 0,
    answeredOnlyDays: 0,
    missedDays: 0,
    pointsSpent: 0,
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = formatLocalDate(new Date(year, month - 1, d))
    const log = logs[date]
    if (log) {
      const st = dayStatus(log)
      if (st === 'canceled') {
        stats.canceledDays += 1
      } else if (st === 'completed' || st === 'freeze' || st === 'repair') {
        stats.completedDays += 1
        if (st === 'freeze') stats.freezeDays += 1
        else if (st === 'repair') stats.repairDays += 1
      } else if (st === 'answered') {
        stats.answeredOnlyDays += 1
      }
      stats.pointsSpent += log.pointsSpent
    } else if (date < todayStr) {
      stats.missedDays += 1
    }
  }
  return stats
}
