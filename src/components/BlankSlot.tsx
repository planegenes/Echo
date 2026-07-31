import { useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'

export interface BlankSlotProps {
  blankId: string
  /** 全角空格填充宽度（撑开下划线宽度） */
  pad: string
  /** 已填入的选项 value（或空） */
  filledValue: string | null
  /** 结果反馈：correct/wrong，或 null 表示未确认 */
  result?: 'correct' | 'wrong' | null
  onClick: () => void
  selectedOptionForFill?: string | null
  disabled?: boolean
}

/**
 * 选词模式下的下划线空白槽
 * - 可拖拽放置（@dnd-kit useDroppable，id=`blank:${blankId}`）
 * - 已填入的选项可再次拖动（useDraggable，id=`slot:${blankId}`）
 *   - 拖到其他 blank：移动选项
 *   - 拖到候选区 pool：释放回候选区
 * - 可点击填入（用 selectedOptionForFill 标记当前选中的选项）
 * - 点击已填入的空白槽可清空
 * - 始终渲染 pad（opacity 0）保持宽度稳定，filledValue 绝对定位叠加显示
 */
export function BlankSlot({
  blankId,
  pad,
  filledValue,
  result,
  onClick,
  disabled,
}: BlankSlotProps) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `blank:${blankId}`,
  })

  // 当 filledValue 存在且未 disabled 时，启用内部 draggable
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } =
    useDraggable({
      id: `slot:${blankId}`,
      disabled: !filledValue || disabled,
    })

  const filledStyle: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <button
      ref={setDropRef}
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'relative inline-flex items-center justify-center min-w-[3rem] align-baseline mx-1 my-0.5',
        'rounded-sm border-b-2 px-1 py-0.5 transition-colors',
        result === 'correct'
          ? 'border-success text-success bg-success/10'
          : result === 'wrong'
            ? 'border-destructive text-destructive bg-destructive/10'
            : isOver
              ? 'border-primary bg-primary/10'
              : filledValue
                ? 'border-primary/60 bg-primary/5'
                : 'border-current bg-transparent',
      )}
    >
      {/* 始终渲染 pad 保持宽度稳定（不可见） */}
      <span className="opacity-0 select-none" aria-hidden>
        {pad || ' '}
      </span>
      {/* filledValue 叠加在 pad 上面（绝对定位），并启用拖动 */}
      {filledValue && (
        <span
          ref={setDragRef}
          style={filledStyle}
          {...attributes}
          {...listeners}
          className="absolute inset-0 flex items-center justify-center font-medium cursor-grab active:cursor-grabbing"
        >
          {filledValue}
        </span>
      )}
    </button>
  )
}
