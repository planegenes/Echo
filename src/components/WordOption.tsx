import { useCallback, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ContentRenderer } from '@/components/ContentRenderer'
import { cn } from '@/lib/utils'

export interface WordOptionProps {
  optionId: string
  value: string
  selected: boolean
  /** 当前拖动是否在候选区内：区内保留占位空隙，区外平滑收起紧密排列 */
  isOverPool?: boolean
  onClick: () => void
}

/**
 * 候选区可拖拽选项气泡
 * - 拖拽：@dnd-kit useSortable（候选区内排序）
 * - 点击：onClick 选中
 * - 拖出候选区时宽度坍缩（max-width/padding/border/margin 折叠），其他选项紧密靠拢。
 *   坍缩只抵消右侧 gap（margin-left 保持 0，避免 rect.left 偏移），配合自定义的
 *   gap 感知排序策略（位移 = 拖动选项宽度 + 其相邻 gap），排序不会错位。
 */
export function WordOption({
  optionId,
  value,
  selected,
  isOverPool,
  onClick,
}: WordOptionProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useSortable({ id: optionId })

  // 记录自然宽度用于准确的收起过渡（用 state 而非 ref，避免 render 期访问 ref）
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null)

  // 合并 sortable 的 ref 与测量 ref
  const setRefs = useCallback(
    (node: HTMLButtonElement | null) => {
      setNodeRef(node)
      if (node && measuredWidth === null) {
        setMeasuredWidth(node.getBoundingClientRect().width)
      }
    },
    [setNodeRef, measuredWidth],
  )

  // 拖出候选区时收起（区内则保留 0.4 透明占位）
  const collapse = isDragging && !isOverPool

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition:
      'transform 200ms ease, max-width 200ms ease, opacity 200ms ease, padding 200ms ease, border-width 200ms ease, background-color 150ms, color 150ms, border-color 150ms',
    opacity: collapse ? 0 : isDragging ? 0.4 : 1,
    maxWidth: collapse ? 0 : (measuredWidth ?? undefined),
    paddingLeft: collapse ? 0 : undefined,
    paddingRight: collapse ? 0 : undefined,
    borderLeftWidth: collapse ? 0 : undefined,
    borderRightWidth: collapse ? 0 : undefined,
    // 坍缩时用负 margin 抵消与后一项的 gap（gap-2 = 8px），实现紧密靠拢；
    // 只抵消右侧（margin-left 保持 0），避免拖动项自身 rect.left 偏移破坏测量
    marginRight: collapse ? -8 : undefined,
    overflow: collapse ? 'hidden' : undefined,
  }

  return (
    <button
      ref={setRefs}
      style={style}
      type="button"
      onClick={onClick}
      {...attributes}
      {...listeners}
      className={cn(
        'select-none cursor-grab active:cursor-grabbing whitespace-nowrap rounded-md border px-3 py-1.5 text-sm font-medium',
        selected
          ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
          : 'border-border bg-card hover:border-primary/40 hover:bg-accent/30',
      )}
    >
      {value.includes('^') ? (
        <ContentRenderer
          content={{ format: 'ruby', value }}
        />
      ) : (
        value
      )}
    </button>
  )
}
