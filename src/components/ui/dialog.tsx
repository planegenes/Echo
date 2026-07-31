import * as React from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * 简易 Dialog（不依赖 Radix Dialog）
 * 通过 Portal 渲染到 body，点击遮罩或 Esc 关闭
 * DialogClose 通过 Context 自动调用 onOpenChange(false)
 */
export interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

const DialogContext = React.createContext<{ close: () => void } | null>(null)

const Dialog: React.FC<DialogProps> = ({ open, onOpenChange, children }) => {
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  if (!open) return null

  const ctxValue = { close: () => onOpenChange(false) }

  return createPortal(
    <DialogContext.Provider value={ctxValue}>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
      >
        <div
          className="absolute inset-0 bg-black/60 animate-in fade-in-0"
          onClick={() => onOpenChange(false)}
        />
        <div className="relative z-10 w-full max-w-lg rounded-xl border bg-popover p-6 text-popover-foreground shadow-lg">
          {children}
        </div>
      </div>
    </DialogContext.Provider>,
    document.body,
  )
}

const DialogHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => <div className={cn('mb-4 flex flex-col gap-1', className)} {...props} />

const DialogTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  className,
  ...props
}) => (
  <h2
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
)

const DialogDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  className,
  ...props
}) => (
  <p className={cn('text-sm text-muted-foreground', className)} {...props} />
)

const DialogFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => (
  <div
    className={cn('mt-6 flex justify-end gap-2', className)}
    {...props}
  />
)

const DialogClose: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  className,
  onClick,
  ...props
}) => {
  const ctx = React.useContext(DialogContext)
  return (
    <button
      type="button"
      className={cn(
        'absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none',
        className,
      )}
      onClick={(e) => {
        onClick?.(e)
        ctx?.close()
      }}
      {...props}
    >
      <X className="h-4 w-4" />
      <span className="sr-only">关闭</span>
    </button>
  )
}

export {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
}
