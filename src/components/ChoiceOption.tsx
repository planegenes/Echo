import { ContentRenderer } from '@/components/ContentRenderer'
import type { ContentFormat } from '@/types'
import { cn } from '@/lib/utils'
import { useLongPress } from '@/hooks/useLongPress'

export interface ChoiceOptionProps {
  value: string
  format: ContentFormat
  /** 高亮为正确答案（答对或揭示答案时） */
  showCorrect?: boolean
  /** 刚答错（红色闪烁） */
  justWrong?: boolean
  /** 处于熄灭状态（淡化 + 删除线） */
  dimmed?: boolean
  /** 熄灭是否可解除：true 时熄灭态下长按解除、单击解除并选中；false 时永久锁定 */
  canUnDim?: boolean
  /** 长按回调（标记/取消标记无关） */
  onLongPress?: () => void
  onClick: () => void
  disabled?: boolean
}

/**
 * 单选选项按钮
 * - showCorrect：答对 / 揭示答案时正确答案高亮绿色
 * - justWrong：答错瞬间红色闪烁
 * - dimmed + canUnDim：长按标记的无关项（可解除），长按恢复、单击解除并选中
 * - dimmed + !canUnDim：答错后永久排除（不可解除），完全锁定
 */
export function ChoiceOption({
  value,
  format,
  showCorrect,
  justWrong,
  dimmed,
  canUnDim,
  onLongPress,
  onClick,
  disabled,
}: ChoiceOptionProps) {
  const locked = !!dimmed && !canUnDim
  const trulyDisabled = disabled || locked || justWrong || showCorrect

  const longPressHandlers = useLongPress(() => {
    if (locked) return
    onLongPress?.()
  })

  return (
    <button
      type="button"
      onClick={() => {
        if (trulyDisabled) return
        onClick()
      }}
      onClickCapture={longPressHandlers.onClickCapture}
      onPointerDown={longPressHandlers.onPointerDown}
      onPointerUp={longPressHandlers.onPointerUp}
      onPointerLeave={longPressHandlers.onPointerLeave}
      onPointerCancel={longPressHandlers.onPointerCancel}
      onContextMenu={longPressHandlers.onContextMenu}
      disabled={trulyDisabled}
      aria-disabled={dimmed || undefined}
      className={cn(
        'w-full min-h-[3rem] rounded-lg border px-4 py-2.5 text-center transition-all',
        'flex items-center justify-center gap-2 text-sm font-medium',
        dimmed
          ? 'border-border bg-card opacity-40 text-muted-foreground line-through'
          : showCorrect
            ? 'border-success bg-success/15 text-success'
            : justWrong
              ? 'border-destructive bg-destructive/15 animate-[shake_0.3s_ease-in-out]'
              : 'border-border bg-card hover:border-primary/40 hover:bg-accent/30',
        trulyDisabled && 'cursor-not-allowed',
        dimmed && 'cursor-default',
      )}
    >
      <ContentRenderer
        content={{ format, value }}
        className={dimmed ? 'line-through' : undefined}
      />
    </button>
  )
}
