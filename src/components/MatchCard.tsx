import { ContentRenderer } from '@/components/ContentRenderer'
import type { Content } from '@/types'
import { cn } from '@/lib/utils'
import { useLongPress } from '@/hooks/useLongPress'

export interface MatchCardProps {
  content: Content
  /** 卡片唯一 id */
  cardId: string
  /** 当前选中（高亮） */
  selected: boolean
  /** 刚选对：变绿、pop 动画 */
  justMatched?: boolean
  /** 刚选错：变红、shake 动画 */
  justWrong?: boolean
  /** 配对成功期间其他卡片淡出 */
  faded?: boolean
  /** 长按标记为无关：淡化 + 删除线 + disabled */
  markedIrrelevant?: boolean
  /** 长按回调（标记/取消标记） */
  onLongPress?: () => void
  onClick: () => void
  disabled?: boolean
}

/**
 * 配对卡片：展示 left/right 内容
 * - selected：高亮选中
 * - justMatched：刚配对成功（绿色 + pop）
 * - justWrong：刚选错（红色 + shake）
 * - faded：其他卡片在匹配动画期间淡出
 * - markedIrrelevant：长按标记为无关（淡化 + 删除线 + disabled，再次长按可取消）
 */
export function MatchCard({
  content,
  selected,
  justMatched,
  justWrong,
  faded,
  markedIrrelevant,
  onLongPress,
  onClick,
  disabled,
}: MatchCardProps) {
  const longPressHandlers = useLongPress(() => onLongPress?.())

  // markedIrrelevant 时不 disable（保证 pointer 事件可触发用于再次长按取消），
  // 而是在 click 中拦截
  const trulyDisabled = disabled || justMatched || justWrong || faded

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
        'w-full min-h-[5rem] rounded-lg border px-4 py-3 text-center transition-all duration-200',
        'flex items-center justify-center text-sm font-medium',
        markedIrrelevant
          ? 'border-border bg-card opacity-40 text-muted-foreground line-through'
          : justMatched
            ? 'border-success bg-success/20 text-success ring-2 ring-success animate-[pop_0.35s_ease-out]'
            : justWrong
              ? 'border-destructive bg-destructive/15 text-destructive ring-2 ring-destructive animate-[shake_0.4s_ease-in-out]'
              : selected
                ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                : faded
                  ? 'border-border bg-card opacity-30'
                  : 'border-border bg-card hover:border-primary/40 hover:bg-accent/30',
        'disabled:cursor-default',
        markedIrrelevant && 'cursor-default',
      )}
    >
      <ContentRenderer content={content} className={markedIrrelevant ? 'line-through' : undefined} />
    </button>
  )
}
