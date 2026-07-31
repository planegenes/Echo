import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'

export interface WordOptionProps {
  optionId: string
  value: string
  used: boolean
  selected: boolean
  onClick: () => void
  /** 拖拽时禁用点击反馈 */
  dragging?: boolean
}

/**
 * 可拖拽的选项气泡
 * - 拖拽：使用 @dnd-kit useDraggable
 * - 点击：onClick 选中
 * - used：被填入空白槽后置灰
 */
export function WordOption({
  optionId,
  value,
  used,
  selected,
  onClick,
}: WordOptionProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: optionId })

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : used ? 0.4 : 1,
  }

  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      onClick={onClick}
      {...attributes}
      {...listeners}
      className={cn(
        'select-none cursor-grab active:cursor-grabbing rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
        used
          ? 'border-border bg-muted text-muted-foreground line-through'
          : selected
            ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
            : 'border-border bg-card hover:border-primary/40 hover:bg-accent/30',
      )}
    >
      {value}
    </button>
  )
}
