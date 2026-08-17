import { useEffect, useRef, useState } from 'react'
import { useAtomValue } from 'jotai'
import { pointsAtom } from '@/store/points'
import { cn } from '@/lib/utils'

/** 最后鼠标位置（模块级变量，避免高频 pointermove 触发 setState） */
let lastPointer = { x: 0, y: 0 }

function trackLastPointer() {
  if (typeof window === 'undefined') return () => {}
  const onMove = (e: PointerEvent) => {
    lastPointer = { x: e.clientX, y: e.clientY }
  }
  window.addEventListener('pointermove', onMove, { passive: true })
  return () => window.removeEventListener('pointermove', onMove)
}

interface FloatItem {
  id: number
  x: number
  y: number
  value: number
}

/**
 * 光标位置积分浮动层
 * - 监听积分变化，在最后鼠标位置弹出 +N / -N（负数表示扣分）
 * - 与顶栏的积分浮动并存（不取消），多条可叠加
 */
export function PointsFloatLayer() {
  const state = useAtomValue(pointsAtom)
  const [floats, setFloats] = useState<FloatItem[]>([])
  const prevRef = useRef(state.points)
  const idRef = useRef(0)

  useEffect(() => trackLastPointer(), [])

  useEffect(() => {
    const prev = prevRef.current
    if (state.points === prev) return
    prevRef.current = state.points
    const delta = state.points - prev
    if (delta === 0) return
    const id = ++idRef.current
    const item = { id, x: lastPointer.x, y: lastPointer.y, value: delta }
    setFloats((f) => [...f, item])
    const t = setTimeout(() => {
      setFloats((f) => f.filter((x) => x.id !== id))
    }, 900)
    return () => clearTimeout(t)
  }, [state.points])

  return (
    <div className="pointer-events-none fixed inset-0 z-[100]">
      {floats.map((f) => (
        <span
          key={f.id}
          style={{ left: f.x, top: f.y }}
          className={cn(
            'absolute text-sm font-bold animate-[points-float_0.9s_ease-out_forwards]',
            f.value >= 0 ? 'text-emerald-500' : 'text-red-500',
          )}
        >
          {f.value > 0 ? `+${f.value}` : f.value}
        </span>
      ))}
    </div>
  )
}
