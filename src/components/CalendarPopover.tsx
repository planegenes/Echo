import { useMemo, useState } from 'react'
import { useAtomValue, useStore } from 'jotai'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { dayLogsAtom, repairDateOnCalendar } from '@/store/dailyStreak'
import {
  DAILY_REPAIR_COST,
  canRepairDate,
  dayStatus,
  formatLocalDate,
  getMonthCalendar,
  getMonthStats,
} from '@/lib/dailyStreak'
import { cn } from '@/lib/utils'
import { STATUS_LABEL, STATUS_STYLE, WEEKDAYS } from '@/components/calendarStyles'
import { RepairConfirmPopup } from '@/components/RepairConfirmPopup'

/**
 * 顶栏连胜处 hover 弹出的当月打卡日历
 * - 绿色 = 完整打卡；蓝色 = 积分修复打卡；黄色 = 答题未完成；灰色 = 未答题
 * - 支持切换月份查看历史记录
 * - 可补签的日期（其后直到昨天都已打卡）带虚线框，点击消耗积分补签，补签后可以继续向前补签
 */
export function CalendarPopover() {
  const store = useStore()
  const logs = useAtomValue(dayLogsAtom)
  const today = formatLocalDate()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  /** 待确认补签的日期与锚点 */
  const [pendingRepair, setPendingRepair] = useState<{
    date: string
    x: number
    y: number
  } | null>(null)

  const cells = useMemo(
    () => getMonthCalendar(logs, year, month, today),
    [logs, year, month, today],
  )
  const stats = useMemo(
    () => getMonthStats(logs, year, month, today),
    [logs, year, month, today],
  )

  const goPrev = () => {
    if (month === 1) {
      setYear(year - 1)
      setMonth(12)
    } else {
      setMonth(month - 1)
    }
  }
  const goNext = () => {
    if (month === 12) {
      setYear(year + 1)
      setMonth(1)
    } else {
      setMonth(month + 1)
    }
  }

  /** 点击可补签日期：在点击位置弹出确认 */
  const handleRepair = (e: React.MouseEvent, date: string) => {
    setPendingRepair({ date, x: e.clientX, y: e.clientY })
  }

  const confirmRepair = () => {
    if (pendingRepair) repairDateOnCalendar(store, pendingRepair.date)
    setPendingRepair(null)
  }

  return (
    <div className="invisible absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-lg border bg-popover p-3 text-popover-foreground opacity-0 shadow-lg transition-opacity duration-150 group-hover:visible group-hover:opacity-100">
      {/* 标题 + 月份切换 */}
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={goPrev}
          aria-label="上个月"
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold">
          {year} 年 {month} 月
        </span>
        <button
          type="button"
          onClick={goNext}
          aria-label="下个月"
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* 日历网格（周一开头） */}
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w) => (
          <span key={w} className="pb-0.5 text-xs text-muted-foreground">
            {w}
          </span>
        ))}
        {cells.map((cell, i) => {
          if (cell.dayOfMonth === 0) return <span key={`pad-${i}`} />
          const status = dayStatus(cell.log)
          const isFuture = cell.date > today
          const repairable = !isFuture && canRepairDate(logs, cell.date, today)
          const title = repairable
            ? `${month} 月 ${cell.dayOfMonth} 日 · 未打卡，点击补签（-${DAILY_REPAIR_COST} 积分）`
            : status === 'none'
              ? `${month} 月 ${cell.dayOfMonth} 日`
              : `${month} 月 ${cell.dayOfMonth} 日 · ${
                  status === 'repaired'
                    ? `修复打卡（-${cell.log?.pointsSpent ?? 0} 积分）`
                    : STATUS_LABEL[status]
                }`
          return (
            <button
              key={cell.date}
              type="button"
              title={title}
              disabled={!repairable}
              onClick={(e) => handleRepair(e, cell.date)}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-md text-xs font-medium',
                STATUS_STYLE[status],
                cell.isToday &&
                  'ring-2 ring-ring ring-offset-1 ring-offset-popover',
                isFuture && 'opacity-40',
                repairable &&
                  'cursor-pointer ring-1 ring-dashed ring-ring hover:ring-2',
              )}
            >
              {cell.dayOfMonth}
            </button>
          )
        })}
      </div>

      {/* 图例 + 统计 */}
      <div className="mt-3 border-t pt-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
            完整 {stats.completedDays}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-sky-500" />
            修复 {stats.repairedDays}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" />
            未完成 {stats.answeredOnlyDays}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-muted" />
            未答 {stats.missedDays}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          本月消耗积分 {stats.pointsSpent} · 补签 {DAILY_REPAIR_COST}/天
        </p>
      </div>
      {/* 补签确认弹窗 */}
      {pendingRepair && (
        <RepairConfirmPopup
          x={pendingRepair.x}
          y={pendingRepair.y}
          date={pendingRepair.date}
          onConfirm={confirmRepair}
          onCancel={() => setPendingRepair(null)}
        />
      )}
    </div>
  )
}
