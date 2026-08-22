import { useState } from 'react'
import { useAtomValue, useStore } from 'jotai'
import { CalendarPlus, Coins, CheckCircle2, AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { bulkRepairMonth, dayLogsAtom, type BulkRepairResult } from '@/store/dailyStreak'
import { pointsAtom } from '@/store/points'
import { DAILY_BULK_REPAIR_COST, formatLocalDate } from '@/lib/dailyStreak'

export interface BulkRepairDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * 批量补签弹窗：消耗 13520 积分，将所选月份（当月或之前）今天之前的所有未打卡日期
 * 一次性标记为「批量补签」（日历中以紫色区分）
 */
export function BulkRepairDialog({ open, onOpenChange }: BulkRepairDialogProps) {
  const store = useStore()
  const logs = useAtomValue(dayLogsAtom)
  const points = useAtomValue(pointsAtom)

  const todayStr = formatLocalDate()
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1

  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(currentMonth)
  const [result, setResult] = useState<BulkRepairResult | null>(null)

  // 年份范围：最早有日志的年份 ~ 当前年
  let minYear = currentYear
  for (const date of Object.keys(logs)) {
    const y = Number(date.slice(0, 4))
    if (y < minYear) minYear = y
  }
  const years: number[] = []
  for (let y = currentYear; y >= minYear; y--) years.push(y)

  // 目标月内「今天之前」且未完成打卡的天数（含被取消的打卡：canceled 也算未完成）
  const daysInMonth = new Date(year, month, 0).getDate()
  let missingCount = 0
  for (let d = 1; d <= daysInMonth; d++) {
    const date = formatLocalDate(new Date(year, month - 1, d))
    if (date >= todayStr) continue
    if (logs[date]?.completed) continue
    missingCount++
  }

  const isFuture =
    year > currentYear || (year === currentYear && month > currentMonth)
  const affordable = points.points >= DAILY_BULK_REPAIR_COST
  const canConfirm = !isFuture && missingCount > 0 && affordable

  const handleOpenChange = (o: boolean) => {
    onOpenChange(o)
    if (!o) setResult(null)
  }

  const handleConfirm = () => {
    setResult(bulkRepairMonth(store, year, month))
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CalendarPlus className="h-5 w-5 text-primary" />
          批量补签
        </DialogTitle>
        <DialogDescription>
          消耗 13520 积分，将所选月份（当月或之前）中今天之前的所有未打卡日期标记为「批量补签」（紫色）。
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {/* 年月选择 */}
        <div className="flex items-center gap-2">
          <Select
            value={String(year)}
            onChange={(v) => setYear(Number(v))}
            options={years.map((y) => ({ value: String(y), label: `${y} 年` }))}
            placeholder="选择年份"
            className="flex-1"
          />
          <Select
            value={String(month)}
            onChange={(v) => setMonth(Number(v))}
            options={Array.from({ length: 12 }, (_, i) => ({
              value: String(i + 1),
              label: `${i + 1} 月`,
              disabled: year === currentYear && i + 1 > currentMonth,
            }))}
            placeholder="选择月份"
            className="flex-1"
          />
        </div>

        {/* 信息区 */}
        <div className="space-y-1 rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <p>
            目标月份：{year} 年 {month} 月
            {isFuture && <span className="text-destructive">（未来月份，不可补签）</span>}
          </p>
          <p>可补签天数：{missingCount} 天（今天及已完成日期不计）</p>
          <p className="inline-flex items-center gap-1">
            所需积分：{DAILY_BULK_REPAIR_COST}
            <Coins className="h-3.5 w-3.5 text-amber-500" />
          </p>
          <p className="inline-flex items-center gap-1">
            当前积分：{points.points}
            <Coins className="h-3.5 w-3.5 text-amber-500" />
            {!affordable && <span className="text-destructive">（不足）</span>}
          </p>
        </div>

        {/* 执行结果 */}
        {result && (
          <div
            className={
              'flex items-start gap-2 rounded-md border px-3 py-2 text-sm ' +
              (result.ok
                ? 'border-success/40 bg-success/10 text-success'
                : 'border-destructive/40 bg-destructive/10 text-destructive')
            }
          >
            {result.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>
              {result.ok
                ? `已批量补签 ${result.count} 天，消耗 ${result.cost} 积分。`
                : result.reason === 'insufficient'
                  ? `积分不足，至少需要 ${result.cost} 积分。`
                  : '该月没有可补签的日期。'}
            </span>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => handleOpenChange(false)}>
            取消
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={!canConfirm}
            title={
              isFuture
                ? '不能选择未来月份'
                : missingCount === 0
                  ? '该月没有可补签的日期'
                  : !affordable
                    ? '积分不足'
                    : undefined
            }
          >
            确认批量补签（-{DAILY_BULK_REPAIR_COST} 积分）
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
