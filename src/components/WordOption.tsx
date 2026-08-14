import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'

export interface WordOptionProps {
  optionId: string
  value: string
  selected: boolean
  onClick: () => void
}

/**
 * 候选区可拖拽选项气泡
 * - 拖拽：使用 @dnd-kit useSortable（支持在候选区内排序）
 * - 点击：onClick 选中
 */
export function WordOption({
  optionId,
  value,
  selected,
  onClick,
}: WordOptionProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: optionId })

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
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
        selected
          ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
          : 'border-border bg-card hover:border-primary/40 hover:bg-accent/30',
      )}
    >
      {value}
    </button>
  )
}
