import { useMemo, useState } from 'react'
import { useAtomValue, useStore } from 'jotai'
import {
  Dialog,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { dayLogsAtom, repairDateOnCalendar } from '@/store/dailyStreak'
import { pointsAtom } from '@/store/points'
import {
  canRepairDate,
  dayStatus,
  formatLocalDate,
  getMonthCalendar,
  getMonthStats,
  repairCostFor,
  repairKindFor,
  type MonthStats,
} from '@/lib/dailyStreak'
import { cn } from '@/lib/utils'
import { STATUS_STYLE, WEEKDAYS } from '@/components/calendarStyles'
import { RepairConfirmPopup } from '@/components/RepairConfirmPopup'

export interface YearCalendarDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * 年打卡日历（点击顶栏连胜区域弹出）
 * - 12 个月按 4×3 排布，每月一个迷你月历
 * - 可补签的日期（其后直到昨天都已打卡）带虚线框，点击消耗积分补签，补签后可以继续向前补签
 */
export function YearCalendarDialog({ open, onOpenChange }: YearCalendarDialogProps) {
  const store = useStore()
  const logs = useAtomValue(dayLogsAtom)
  const today = formatLocalDate()
  const year = useMemo(() => new Date().getFullYear(), [])
  /** 待确认补签的日期与锚点 */
  const [pendingRepair, setPendingRepair] = useState<{
    date: string
    x: number
    y: number
  } | null>(null)

  const months = useMemo(
    () => Array.from({ length: 12 }, (_, i) => getMonthCalendar(logs, year, i + 1, today)),
    [logs, year, today],
  )

  /** 全年统计（12 个月汇总，底部图例与月日历一致） */
  const yearStats = useMemo(() => {
    const total: MonthStats = {
      completedDays: 0,
      freezeDays: 0,
      repairDays: 0,
      canceledDays: 0,
      answeredOnlyDays: 0,
      missedDays: 0,
      pointsSpent: 0,
    }
    for (let m = 1; m <= 12; m++) {
      const s = getMonthStats(logs, year, m, today)
      total.completedDays += s.completedDays
      total.freezeDays += s.freezeDays
      total.repairDays += s.repairDays
      total.canceledDays += s.canceledDays
      total.answeredOnlyDays += s.answeredOnlyDays
      total.missedDays += s.missedDays
      total.pointsSpent += s.pointsSpent
    }
    return total
  }, [logs, year, today])

  /** 点击可补签日期：在点击位置弹出确认 */
  const handleRepair = (e: React.MouseEvent, date: string) => {
    setPendingRepair({ date, x: e.clientX, y: e.clientY })
  }

  const confirmRepair = () => {
    if (pendingRepair) repairDateOnCalendar(store, pendingRepair.date)
    setPendingRepair(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} contentClassName="max-w-4xl">
      <DialogHeader>
        <DialogTitle>{year} 年打卡日历</DialogTitle>
      </DialogHeader>
      <div className="max-h-[70vh] overflow-y-auto p-4">
        {/* 动态列数：auto-fill + minmax，按容器宽度自适应排多少个月 */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
          {months.map((cells, mi) => (
            <div key={mi} className="rounded-md border bg-card p-2">
              <div className="mb-1 text-center text-xs font-semibold">
                {mi + 1} 月
              </div>
              <div className="grid grid-cols-7 gap-0.5 text-center">
                {WEEKDAYS.map((w) => (
                  <span
                    key={w}
                    className="text-[9px] leading-4 text-muted-foreground"
                  >
                    {w}
                  </span>
                ))}
                {cells.map((cell, i) => {
                  if (cell.dayOfMonth === 0) return <span key={`p-${i}`} />
                  const status = dayStatus(cell.log)
                  const isFuture = cell.date > today
                  const repairable = !isFuture && canRepairDate(logs, cell.date, today)
                  const cost = repairCostFor(logs, cell.date, today)
                  const isFreeze =
                    repairKindFor(logs, cell.date, today) === 'freeze'
                  const label = isFreeze ? '连胜激冻' : '补签'
                  return (
                    <button
                      key={cell.date}
                      type="button"
                      disabled={!repairable}
                      title={
                        repairable
                          ? `${mi + 1} 月 ${cell.dayOfMonth} 日 · 未打卡，点击${label}（-${cost} 积分）`
                          : `${mi + 1} 月 ${cell.dayOfMonth} 日`
                      }
                      onClick={(e) => handleRepair(e, cell.date)}
                      className={cn(
                        // 格子自适应列宽（aspect-square 保持正方形），不再固定 24px
                        'flex aspect-square w-full items-center justify-center rounded text-[10px]',
                        STATUS_STYLE[status],
                        cell.isToday && 'ring-2 ring-ring',
                        isFuture && 'opacity-40',
                        repairable &&
                          'cursor-pointer ring-1 ring-dashed hover:ring-2',
                        repairable &&
                          (isFreeze
                            ? 'ring-amber-400'
                            : 'ring-sky-400'),
                      )}
                    >
                      {cell.dayOfMonth}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        {/* 底部图例 + 统计（与月日历一致） */}
        <div className="mt-3 border-t pt-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
              正常 {yearStats.completedDays}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-orange-500" />
              激冻 {yearStats.freezeDays}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-sky-500" />
              补签 {yearStats.repairDays}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-rose-500" />
              取消 {yearStats.canceledDays}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" />
              未完成 {yearStats.answeredOnlyDays}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-muted" />
              未答 {yearStats.missedDays}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            全年消耗积分 {yearStats.pointsSpent}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm ring-1 ring-dashed ring-amber-400" />
              连胜激冻 233
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm ring-1 ring-dashed ring-sky-400" />
              补签 648
            </span>
          </div>
        </div>
      </div>

      {/* 连胜激冻确认弹窗 */}
      {pendingRepair && (
        <RepairConfirmPopup
          x={pendingRepair.x}
          y={pendingRepair.y}
          date={pendingRepair.date}
          cost={repairCostFor(logs, pendingRepair.date, today)}
          canAfford={() =>
            store.get(pointsAtom).points >=
            repairCostFor(logs, pendingRepair.date, today)
          }
          onConfirm={confirmRepair}
          onCancel={() => setPendingRepair(null)}
        />
      )}
    </Dialog>
  )
}
