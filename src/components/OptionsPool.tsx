import { useCallback } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'

export interface OptionsPoolProps {
  children: React.ReactNode
  /** 当前拖动是否在候选区内（几何相交判定，稳定不闪烁） */
  isOverPool: boolean
  /** 从答题区拖出时是否显示「放回」提示 */
  showDropHint: boolean
  ref?: React.Ref<HTMLDivElement>
}

/**
 * 候选区容器（droppable id='pool'）
 * - 边框高亮由父组件的几何判定 isOverPool 驱动（稳定，不闪烁）
 * - 从答题区拖回时显示虚线占位提示
 */
export function OptionsPool({
  children,
  isOverPool,
  showDropHint,
  ref,
}: OptionsPoolProps) {
  const { setNodeRef } = useDroppable({ id: 'pool' })
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node)
      if (typeof ref === 'function') ref(node)
      else if (ref) ref.current = node
    },
    [ref, setNodeRef],
  )
  return (
    <div
      ref={setRefs}
      className={cn(
        'rounded-lg border p-3 transition-colors',
        isOverPool && 'border-primary bg-primary/5',
      )}
    >
      {children}
      {showDropHint && (
        <div className="mt-3 flex items-center justify-center rounded-md border border-dashed border-primary/50 bg-primary/5 py-2.5 text-sm text-muted-foreground">
          松开以放回选项区
        </div>
      )}
    </div>
  )
}