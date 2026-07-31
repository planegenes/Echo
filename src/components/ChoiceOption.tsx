import { ContentRenderer } from '@/components/ContentRenderer'
import { cn } from '@/lib/utils'

export interface ChoiceOptionProps {
  value: string
  format: 'text' | 'latex'
  selected: boolean
  resolved: 'idle' | 'correct' | 'wrong'
  isCorrectAnswer: boolean
  onClick: () => void
  disabled?: boolean
}

/**
 * 单选选项按钮
 * - idle：默认
 * - selected + correct：绿色
 * - selected + wrong：红色
 * - resolved 后正确答案高亮绿色（无论是否被选中）
 */
export function ChoiceOption({
  value,
  format,
  selected,
  resolved,
  isCorrectAnswer,
  onClick,
  disabled,
}: ChoiceOptionProps) {
  const showCorrect = resolved !== 'idle' && isCorrectAnswer
  const showWrong = selected && resolved === 'wrong'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full min-h-[3rem] rounded-lg border px-4 py-2.5 text-center transition-all',
        'flex items-center justify-center gap-2 text-sm font-medium',
        showCorrect
          ? 'border-success bg-success/15 text-success'
          : showWrong
            ? 'border-destructive bg-destructive/15 animate-[shake_0.3s_ease-in-out]'
            : selected
              ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
              : 'border-border bg-card hover:border-primary/40 hover:bg-accent/30',
        disabled && 'cursor-not-allowed',
      )}
    >
      <ContentRenderer content={{ format, value }} />
    </button>
  )
}
