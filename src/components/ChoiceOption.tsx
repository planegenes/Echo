import { ContentRenderer } from '@/components/ContentRenderer'
import type { Content, ContentFormat } from '@/types'
import { cn } from '@/lib/utils'
import { useLongPress } from '@/hooks/useLongPress'

export interface ChoiceOptionProps {
  value: string
  format: ContentFormat
  /** 高亮为正确答案（答对或揭示答案时） */
  showCorrect?: boolean
  /** 是否用黄色高亮（「不会做」揭示时） */
  yellowCorrect?: boolean
  /** 刚答错（红色闪烁） */
  justWrong?: boolean
  /** 答错时在该选项上方浮现的正确匹配内容 */
  floatingMatch?: Content | null
  /** 长按已熄灭选项后在该选项上方弹出的它匹配的正确内容 */
  lockedHint?: Content | null
  /** 处于熄灭状态（淡化 + 删除线） */
  dimmed?: boolean
  /** 熄灭是否可解除：true 时熄灭态下长按解除、单击解除并选中；false 时永久锁定 */
  canUnDim?: boolean
  /** 长按回调（标记/取消标记无关） */
  onLongPress?: () => void
  /** 锁定（永久熄灭）态长按回调（在该选项上方弹出它匹配的正确内容） */
  onLockedLongPress?: () => void
  /** 松开长按（或指针离开/取消）时隐藏弹出的正确匹配 */
  onLockedLongPressRelease?: () => void
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
  yellowCorrect,
  justWrong,
  floatingMatch,
  lockedHint,
  dimmed,
  canUnDim,
  onLongPress,
  onLockedLongPress,
  onLockedLongPressRelease,
  onClick,
  disabled,
}: ChoiceOptionProps) {
  const locked = !!dimmed && !canUnDim
  const trulyDisabled = disabled || locked || justWrong || showCorrect

  const longPressHandlers = useLongPress(() => {
    if (locked) {
      // 已熄灭（锁定）选项：长按触发在该选项上方弹出它匹配的正确内容（按住期间一直显示）
      onLockedLongPress?.()
      return
    }
    onLongPress?.()
  })

  // 指针抬起 / 取消时隐藏长按弹出的正确匹配（对非锁定选项调用也无害）
  const releaseLocked = () => onLockedLongPressRelease?.()
  const onPointerUp = (e: React.PointerEvent) => {
    longPressHandlers.onPointerUp(e)
    releaseLocked()
  }
  const onPointerLeave = (e: React.PointerEvent) => {
    longPressHandlers.onPointerLeave(e)
    // 触屏/笔有隐式指针捕获：手指移动（即使移出按钮边界）不算松开，pointerup 仍会派发到本按钮，
    // 因此移动时保持显示；仅鼠标无隐式捕获，拖出按钮松手事件会丢失，故鼠标移出视为结束
    if (e.pointerType === 'mouse') releaseLocked()
  }
  const onPointerCancel = (e: React.PointerEvent) => {
    longPressHandlers.onPointerCancel(e)
    releaseLocked()
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (trulyDisabled) return
        onClick()
      }}
      onClickCapture={longPressHandlers.onClickCapture}
      onPointerDown={longPressHandlers.onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerCancel}
      onContextMenu={longPressHandlers.onContextMenu}
      disabled={trulyDisabled}
      aria-disabled={dimmed || undefined}
      className={cn(
        'relative w-full min-h-[3rem] rounded-lg border px-4 py-2.5 text-center transition-all',
        'flex items-center justify-center gap-2 text-sm font-medium',
        dimmed
          ? 'border-border bg-card opacity-40 text-muted-foreground line-through'
          : showCorrect && yellowCorrect
            ? 'border-amber-400 bg-amber-400/20 text-amber-600 dark:text-amber-400'
            : showCorrect
              ? 'border-success bg-success/15 text-success'
              : justWrong
                ? 'border-destructive bg-destructive/15 animate-[shake_0.3s_ease-in-out]'
                : 'border-border bg-card hover:border-primary/40 hover:bg-accent/30',
        trulyDisabled && 'cursor-not-allowed',
        dimmed && 'cursor-default',
        // 锁定（熄灭）选项：禁止触摸滚动接管，避免长按期间手指移动触发 pointercancel 导致提示消失
        locked && 'touch-none',
      )}
    >
      <ContentRenderer
        content={{ format, value }}
        className={dimmed ? 'line-through' : undefined}
      />
      {/* 答错时在选项上方浮现该选项对应的正确匹配；长按已熄灭选项同样弹出该选项匹配的内容 */}
      {(justWrong && floatingMatch) || lockedHint ? (
        <span className="pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-amber-400/60 bg-popover px-2 py-1 text-xs font-normal text-popover-foreground shadow-lg animate-in fade-in zoom-in-95">
          <span className="text-muted-foreground">正确匹配：</span>
          <ContentRenderer content={lockedHint ?? floatingMatch!} />
        </span>
      ) : null}
    </button>
  )
}
