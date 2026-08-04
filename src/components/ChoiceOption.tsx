import { ContentRenderer } from '@/components/ContentRenderer'
import type { ContentFormat } from '@/types'
import { cn } from '@/lib/utils'
import { useLongPress } from '@/hooks/useLongPress'

export interface ChoiceOptionProps {
  value: string
  format: ContentFormat
  selected: boolean
  resolved: 'idle' | 'correct' | 'wrong'
  isCorrectAnswer: boolean
  /** 长按标记为无关：淡化 + 删除线 + disabled */
  markedIrrelevant?: boolean
  /** 长按回调（标记/取消标记） */
  onLongPress?: () => void
  onClick: () => void
  disabled?: boolean
}

/**
 * 单选选项按钮
 * - idle：默认
 * - selected + correct：绿色
 * - selected + wrong：红色
 * - resolved 后正确答案高亮绿色（无论是否被选中）
 * - markedIrrelevant：长按标记为无关（淡化 + 删除线 + disabled，再次长按可取消）
 */
export function ChoiceOption({
  value,
  format,
  selected,
  resolved,
  isCorrectAnswer,
  markedIrrelevant,
  onLongPress,
  onClick,
  disabled,
}: ChoiceOptionProps) {
  const showCorrect = resolved !== 'idle' && isCorrectAnswer
  const showWrong = selected && resolved === 'wrong'
  const longPressHandlers = useLongPress(() => onLongPress?.())

  // markedIrrelevant 时不 disable（保证 pointer 事件可触发用于再次长按取消），
  // 而是在 click 中拦截
  const trulyDisabled = disabled

  return (
    <button
      type="button"
      onClick={() => {
        if (markedIrrelevant || trulyDisabled) return
        onClick()
      }}
      onClickCapture={longPressHandlers.onClickCapture}
      onPointerDown={longPressHandlers.onPointerDown}
      onPointerUp={longPressHandlers.onPointerUp}
      onPointerLeave={longPressHandlers.onPointerLeave}
      onPointerCancel={longPressHandlers.onPointerCancel}
      onContextMenu={longPressHandlers.onContextMenu}
      disabled={trulyDisabled}
      aria-disabled={markedIrrelevant || undefined}
      className={cn(
        'w-full min-h-[3rem] rounded-lg border px-4 py-2.5 text-center transition-all',
        'flex items-center justify-center gap-2 text-sm font-medium',
        markedIrrelevant
          ? 'border-border bg-card opacity-40 text-muted-foreground line-through'
          : showCorrect
            ? 'border-success bg-success/15 text-success'
            : showWrong
              ? 'border-destructive bg-destructive/15 animate-[shake_0.3s_ease-in-out]'
              : selected
                ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                : 'border-border bg-card hover:border-primary/40 hover:bg-accent/30',
        disabled && 'cursor-not-allowed',
        markedIrrelevant && 'cursor-default',
      )}
    >
      <ContentRenderer
        content={{ format, value }}
        className={markedIrrelevant ? 'line-through' : undefined}
      />
    </button>
  )
}
