import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SelectOption {
  value: string
  label: React.ReactNode
  disabled?: boolean
  /** 分组名（同组选项上方显示分组标题，如供应商名） */
  group?: string
}

export interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
}

/**
 * 轻量自定义下拉（零依赖，风格对齐 shadcn）
 * - 触发器 + 弹出列表（bg-popover 面板，hover/选中高亮）
 * - 支持分组、禁用项、空占位
 * - 点击外部 / Esc 关闭，方向键导航 + 回车选择
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = '请选择',
  disabled,
  className,
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)

  const selectable = useMemo(() => options.filter((o) => !o.disabled), [options])
  const selectedLabel = options.find((o) => o.value === value)?.label

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  // 高亮项滚动可见
  useEffect(() => {
    if (!open || highlight < 0) return
    const items = listRef.current?.children
    const target = items?.[highlight] as HTMLElement | undefined
    target?.scrollIntoView({ block: 'nearest' })
  }, [open, highlight])

  const toggle = () => {
    if (disabled) return
    setOpen((o) => !o)
    setHighlight(Math.max(0, selectable.findIndex((o) => o.value === value)))
  }

  const pick = (opt: SelectOption) => {
    onChange(opt.value)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        setHighlight(Math.max(0, selectable.findIndex((o) => o.value === value)))
        return
      }
      const dir = e.key === 'ArrowDown' ? 1 : -1
      setHighlight((h) => {
        if (selectable.length === 0) return -1
        return (h + dir + selectable.length) % selectable.length
      })
      return
    }
    if (e.key === 'Enter' && open && highlight >= 0) {
      e.preventDefault()
      const opt = selectable[highlight]
      if (opt) pick(opt)
    }
  }

  // 按 group 分组（保持 options 顺序）
  const groups: { name: string; items: SelectOption[] }[] = []
  for (const opt of options) {
    const name = opt.group ?? ''
    const g = groups.find((x) => x.name === name)
    if (g) g.items.push(opt)
    else groups.push({ name, items: [opt] })
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={toggle}
        onKeyDown={onKeyDown}
        disabled={disabled}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors',
          'hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <span
          className={cn('truncate text-left', !selectedLabel && 'text-muted-foreground')}
        >
          {selectedLabel ?? placeholder}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in zoom-in-95 duration-100"
        >
          {groups.map((g) => (
            <li key={g.name || '__root'} role="none">
              {g.name && (
                <div className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">
                  {g.name}
                </div>
              )}
              <ul role="group">
                {g.items.map((opt) => {
                  const idx = selectable.indexOf(opt)
                  const selected = opt.value === value
                  return (
                    <li key={opt.value} role="none">
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        disabled={opt.disabled}
                        onClick={() => pick(opt)}
                        onMouseEnter={() => {
                          if (!opt.disabled) setHighlight(idx)
                        }}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm',
                          'disabled:cursor-not-allowed disabled:opacity-40',
                          highlight === idx
                            ? 'bg-accent text-accent-foreground'
                            : selected
                              ? 'bg-accent/60'
                              : 'hover:bg-accent',
                        )}
                      >
                        <span className="truncate">{opt.label}</span>
                        {selected && <Check className="h-4 w-4 shrink-0" />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
