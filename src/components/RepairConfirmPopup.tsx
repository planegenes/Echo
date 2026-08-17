import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'

export interface RepairConfirmPopupProps {
  /** 锚点坐标（点击格子的位置） */
  x: number
  y: number
  /** 待补签日期（YYYY-MM-DD） */
  date: string
  /** 本次消耗积分（昨天 233，更早 648） */
  cost: number
  onConfirm: () => void
  onCancel: () => void
}

/**
 * 连胜激冻确认小弹窗（原地弹出，替代浏览器原生 confirm）
 * - 定位在点击位置上方，点击外部 / Esc 关闭
 */
export function RepairConfirmPopup({
  x,
  y,
  date,
  cost,
  onConfirm,
  onCancel,
}: RepairConfirmPopupProps) {
  const ref = useRef<HTMLDivElement | null>(null)

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
        <p className="text-sm font-medium">连胜激冻 {date}？</p>
        <p className="mt-1 text-xs text-muted-foreground">
          消耗 {cost} 积分，连胜激冻后可以继续向前连胜激冻。
        </p>
        <div className="mt-2.5 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            取消
          </Button>
          <Button size="sm" onClick={onConfirm}>
            确认激冻
          </Button>
        </div>
      </div>
    </div>
  )
}
