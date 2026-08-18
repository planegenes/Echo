import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { DAILY_STREAK_REPAIR_COST } from '@/lib/dailyStreak'

export interface RepairConfirmPopupProps {
  /** 锚点坐标（点击格子的位置） */
  x: number
  y: number
  /** 待补签日期（YYYY-MM-DD） */
  date: string
  /** 本次消耗积分（连胜激冻 233 = 昨天且前天已打卡，补签 648 = 其余） */
  cost: number
  /** 判断当前是否有足够积分支付本次操作（返回 true 可支付）；缺省视为可支付 */
  canAfford?: () => boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * 连胜激冻 / 补签确认小弹窗（原地弹出，替代浏览器原生 confirm）
 * - 「连胜激冻」（昨天且前天已打卡，233 积分）与「补签」（其余，648 积分）由 cost 区分
 * - 积分不足时禁用确认按钮并显示 not-allowed 光标
 * - 定位在点击位置上方，点击外部 / Esc 关闭
 */
export function RepairConfirmPopup({
  x,
  y,
  date,
  cost,
  canAfford,
  onConfirm,
  onCancel,
}: RepairConfirmPopupProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const label = cost === DAILY_STREAK_REPAIR_COST ? '连胜激冻' : '补签'
  const desc =
    label === '连胜激冻'
      ? `消耗 ${cost} 积分，使用连胜激冻保护连胜。`
      : `消耗 ${cost} 积分，补签后可以继续向前补签。`
  const affordable = canAfford ? canAfford() : true

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onCancel()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onCancel])

  return (
    <div ref={ref} className="fixed z-[100]" style={{ left: x, top: y }}>
      <div className="w-60 -translate-x-1/2 -translate-y-full rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg animate-in fade-in zoom-in-95">
        <p className="text-sm font-medium">
          {label} {date}？
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
        <div className="mt-2.5 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            取消
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={!affordable}
            title={!affordable ? '积分不足' : undefined}
            className={!affordable ? 'cursor-not-allowed' : undefined}
          >
            确认{label}
          </Button>
        </div>
      </div>
    </div>
  )
}
