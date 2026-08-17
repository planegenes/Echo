import { useMemo, useState } from 'react'
import { useAtomValue, useStore } from 'jotai'
import {
  Dialog,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { dayLogsAtom, repairDateOnCalendar } from '@/store/dailyStreak'
import {
  canRepairDate,
  dayStatus,
  formatLocalDate,
  getMonthCalendar,
  repairCostFor,
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
                  const cost = repairCostFor(cell.date, today)
                  return (
                    <button
                      key={cell.date}
                      type="button"
                      disabled={!repairable}
                      title={
                        repairable
                          ? `${mi + 1} 月 ${cell.dayOfMonth} 日 · 未打卡，点击连胜激冻（-${cost} 积分）`
                          : `${mi + 1} 月 ${cell.dayOfMonth} 日`
                      }
                      onClick={(e) => handleRepair(e, cell.date)}
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded text-[10px]',
                        STATUS_STYLE[status],
                        cell.isToday && 'ring-2 ring-ring',
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
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          虚线框日期为可连胜激冻日，点击消耗积分（昨天 233、更早 648）连胜激冻，激冻后可以继续向前。
        </p>
      </div>

      {/* 连胜激冻确认弹窗 */}
      {pendingRepair && (
        <RepairConfirmPopup
          x={pendingRepair.x}
          y={pendingRepair.y}
          date={pendingRepair.date}
          cost={repairCostFor(pendingRepair.date, today)}
          onConfirm={confirmRepair}
          onCancel={() => setPendingRepair(null)}
        />
      )}
    </Dialog>
  )
}
