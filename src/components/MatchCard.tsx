import { ContentRenderer } from '@/components/ContentRenderer'
import type { Content } from '@/types'
import { cn } from '@/lib/utils'

export interface MatchCardProps {
  content: Content
  pairId: string
  side: 'left' | 'right'
  /** 当前选中（高亮） */
  selected: boolean
  /** 刚选对：变绿、pop 动画 */
  justMatched?: boolean
  /** 刚选错：变红、shake 动画 */
  justWrong?: boolean
  /** 配对成功期间其他卡片淡出 */
  faded?: boolean
  onClick: () => void
  disabled?: boolean
}

/**
 * 配对卡片：展示 left/right 内容
 * - selected：高亮选中
 * - justMatched：刚配对成功（绿色 + pop）
 * - justWrong：刚选错（红色 + shake）
 * - faded：其他卡片在匹配动画期间淡出
 */
export function MatchCard({
  content,
  selected,
  justMatched,
  justWrong,
  faded,
  onClick,
  disabled,
}: MatchCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || justMatched || justWrong || faded}
      className={cn(
        'w-full min-h-[5rem] rounded-lg border px-4 py-3 text-center transition-all duration-200',
        'flex items-center justify-center text-sm font-medium',
        justMatched
          ? 'border-success bg-success/20 text-success ring-2 ring-success animate-[pop_0.35s_ease-out]'
          : justWrong
            ? 'border-destructive bg-destructive/15 text-destructive ring-2 ring-destructive animate-[shake_0.4s_ease-in-out]'
            : selected
              ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
              : faded
                ? 'border-border bg-card opacity-30'
                : 'border-border bg-card hover:border-primary/40 hover:bg-accent/30',
        'disabled:cursor-default',
      )}
    >
      <ContentRenderer content={content} />
    </button>
  )
}
