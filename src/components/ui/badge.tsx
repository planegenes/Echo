import * as React from 'react'
import { cn } from '@/lib/utils'

const Badge = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'
  }
>(({ className, variant = 'default', ...props }, ref) => {
  const variantCls: Record<NonNullable<typeof variant>, string> = {
    default: 'border-transparent bg-primary text-primary-foreground',
    secondary: 'border-transparent bg-secondary text-secondary-foreground',
    destructive: 'border-transparent bg-destructive text-destructive-foreground',
    outline: 'text-foreground',
    success: 'border-transparent bg-success text-success-foreground',
    warning: 'border-transparent bg-warning text-warning-foreground',
  }
  return (
    <div
      ref={ref}
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
        variantCls[variant],
        className,
      )}
      {...props}
    />
  )
})
Badge.displayName = 'Badge'

export { Badge }
