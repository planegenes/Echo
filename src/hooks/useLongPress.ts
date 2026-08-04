import { useCallback, useRef } from 'react'

/**
 * 长按检测 hook
 * - 在 pointer down 时启动计时器，达到阈值后触发回调
 * - pointer up / leave / cancel 时清除计时器
 * - 长按触发后会抑制紧接着的 click 事件（通过 onClickCapture 捕获阶段阻止）
 * - 支持触觉反馈（移动端 vibrate 15ms）
 */
const DEFAULT_THRESHOLD = 500

export interface LongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
  onPointerLeave: (e: React.PointerEvent) => void
  onPointerCancel: (e: React.PointerEvent) => void
  /** 捕获阶段阻止因长按触发的 click */
  onClickCapture: (e: React.MouseEvent) => void
  /** 阻止触控/笔长按弹出的浏览器右键菜单 */
  onContextMenu: (e: React.MouseEvent) => void
}

export function useLongPress(
  onLongPress: () => void,
  threshold = DEFAULT_THRESHOLD,
): LongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressClickRef = useRef(false)
  const pointerTypeRef = useRef<string>('')

  const start = useCallback((e: React.PointerEvent) => {
    pointerTypeRef.current = e.pointerType
    suppressClickRef.current = false
    timerRef.current = setTimeout(() => {
      suppressClickRef.current = true
      onLongPress()
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(15)
      }
    }, threshold)
  }, [onLongPress, threshold])

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (suppressClickRef.current) {
      e.preventDefault()
      e.stopPropagation()
      suppressClickRef.current = false
    }
  }, [])

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    // 触控/笔长按时阻止浏览器右键菜单
    if (pointerTypeRef.current === 'touch' || pointerTypeRef.current === 'pen') {
      e.preventDefault()
    }
  }, [])

  return {
    onPointerDown: start,
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onClickCapture,
    onContextMenu,
  }
}
