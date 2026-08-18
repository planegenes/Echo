import {
  MASTERY_MANUAL_STEP,
  masteryOf,
} from '@/lib/weight'
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface MasteryControlProps {
  /** 任意带熟练度的题目（PairItem / TextItem / SentenceItem） */
  item: { mastery?: number }
  /** 点击 ↓ / ↑ 时的回调（delta = ±0.5） */
  onAdjust: (delta: number) => void
  /** 点击重置（熟练度归零） */
  onReset: () => void
  /** 紧凑模式（用于小行高列表） */
  compact?: boolean
}

/**
 * 题库熟练度操作区：[↓|值|↑] 圆角矩形 + 重置按钮（熟练度 ≠ 0 时显示）
 * - 左侧 ↓ 降低熟练度（-0.5），右侧 ↑ 提高熟练度（+0.5）
 * - 中间只显示数值，颜色区分：负值（易错）warning 色、正值（熟练）success 色、0 默认色
 * - 文字（易错度/熟练度）只在 hover 提示中出现
 */
export function MasteryControl({
  item,
  onAdjust,
  onReset,
  compact,
}: MasteryControlProps) {
  const m = masteryOf(item)
  const size = compact ? 'h-5 w-5' : 'h-6 w-6'
  // 数值（保留一位小数，去掉尾随 0），负值带符号
  const rounded = Math.round(m * 10) / 10
  const numText = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(1)
  // hover 提示文字：<0 易错度、>0 熟练度、=0 不显示提示
  const abs = Math.abs(rounded)
  const absText = Number.isInteger(abs) ? String(abs) : abs.toFixed(1)
  const tip =
    rounded < 0
      ? `易错度 ${absText}`
      : rounded > 0
        ? `熟练度 ${absText}`
        : undefined
  return (
    <div className="flex items-center gap-1">
      {m !== 0 && (
        <button
          type="button"
          onClick={onReset}
          title="重置熟练度（归零）"
          className={cn(
            'flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
            size,
          )}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="flex items-center overflow-hidden rounded-md border bg-muted/30 text-xs">
        <button
          type="button"
          onClick={() => onAdjust(-MASTERY_MANUAL_STEP)}
          title={`降低熟练度（-${MASTERY_MANUAL_STEP}）`}
          className={cn(
            'flex items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
            size,
          )}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <span
          className={cn(
            'px-1 text-center tabular-nums',
            compact ? 'min-w-[2.25rem]' : 'min-w-[2.5rem]',
            rounded < 0 && 'text-warning',
            rounded > 0 && 'text-success',
          )}
          title={tip}
        >
          {numText}
        </span>
        <button
          type="button"
          onClick={() => onAdjust(MASTERY_MANUAL_STEP)}
          title={`提高熟练度（+${MASTERY_MANUAL_STEP}）`}
          className={cn(
            'flex items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
            size,
          )}
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
