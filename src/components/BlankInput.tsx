import { cn } from '@/lib/utils'

export interface BlankInputProps {
  blankId: string
  /** 全角空格宽度，用于设置输入框宽度 */
  pad: string
  value: string
  onChange: (value: string) => void
  /** 结果反馈 */
  result?: 'correct' | 'wrong' | null
  standardAnswer?: string
  disabled?: boolean
  autoFocus?: boolean
}

/**
 * 填空模式下的居中输入框
 * - 宽度与选词模式一致（基于 pad 长度）
 * - 居中显示文字
 * - 确认后根据 result 高亮
 */
export function BlankInput({
  blankId,
  pad,
  value,
  onChange,
  result,
  standardAnswer,
  disabled,
  autoFocus,
}: BlankInputProps) {
  // 使用 pad 的字符数估算宽度
  const padWidth = Array.from(pad).length
  const widthCh = Math.max(padWidth + 2, 4)

  return (
    <span className="inline-flex items-center justify-center align-baseline mx-1 my-0.5">
      <input
        // eslint-disable-next-line react/no-unknown-property
        data-blank-id={blankId}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        autoFocus={autoFocus}
        spellCheck={false}
        autoComplete="off"
        style={{ width: `${widthCh}ch` }}
        className={cn(
          'mx-1 px-1.5 py-0.5 rounded-sm border-b-2 text-center text-sm font-medium bg-transparent focus:outline-none focus:ring-1 focus:ring-ring transition-colors',
          result === 'correct'
            ? 'border-success text-success'
            : result === 'wrong'
              ? 'border-destructive text-destructive'
              : 'border-current text-foreground',
        )}
        aria-label={`空白 ${blankId} 答案输入`}
      />
      {result === 'wrong' && standardAnswer && (
        <span className="ml-1 text-xs text-muted-foreground">
          （参考答案：{standardAnswer}）
        </span>
      )}
    </span>
  )
}
