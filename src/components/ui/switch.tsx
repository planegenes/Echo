import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * 简易 Switch（不依赖 Radix）
 * - 受控：checked + onCheckedChange
 * - 非受控：defaultValue + 点击切换内部状态
 */
export interface SwitchProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'size'> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked, onCheckedChange, disabled, ...props }, ref) => {
    const isControlled = checked !== undefined
    const [internal, setInternal] = React.useState<boolean>(
      (props.defaultValue as unknown as boolean) ?? false,
    )
    const value = isControlled ? (checked as boolean) : internal

    const toggle = () => {
      if (disabled) return
      const next = !value
      if (!isControlled) setInternal(next)
      onCheckedChange?.(next)
    }

    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={value}
        disabled={disabled}
        onClick={toggle}
        className={cn(
          'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          value ? 'bg-primary' : 'bg-input',
          className,
        )}
      >
        <span
          className={cn(
            'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform',
            value ? 'translate-x-4' : 'translate-x-0',
          )}
        />
      </button>
    )
  },
)
Switch.displayName = 'Switch'

export { Switch }
