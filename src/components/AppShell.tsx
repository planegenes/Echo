import * as React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Home, Layers, FileText, BookOpen, Settings, Sun, Moon, Puzzle, Coins, Flame, MousePointerClick, PenLine } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Logo } from '@/components/Logo'
import { cn } from '@/lib/utils'
import { useSettingsValue, useSetSettings } from '@/store/atoms'
import { usePointsValue } from '@/hooks/usePoints'
import { useDailyStreakValue } from '@/hooks/useDailyStreak'
import { CalendarPopover } from '@/components/CalendarPopover'
import { YearCalendarDialog } from '@/components/YearCalendarDialog'

interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

/**
 * 连胜火焰图标颜色：
 * - 0 天（已断）：灰色（由调用方 className 控制）
 * - 1~29 天：由黄（hue 48）渐变为橘红（hue 20）
 * - 30 天及以上：保持橘红不变
 */
function flameColor(streakDays: number): string {
  const hue = Math.max(20, Math.round(48 - ((streakDays - 1) / 29) * 28))
  return `hsl(${hue} 100% 55%)`
}

const NAV: NavItem[] = [
  { to: '/', label: '首页', icon: Home },
  { to: '/match', label: '配对', icon: Layers },
  { to: '/choice', label: '单选', icon: MousePointerClick },
  { to: '/dictation', label: '默写', icon: PenLine },
  { to: '/texts', label: '填空', icon: FileText },
  { to: '/sentences', label: '组句', icon: Puzzle },
  { to: '/manage', label: '题库', icon: BookOpen },
  { to: '/settings', label: '设置', icon: Settings },
]

export interface AppShellProps {
  children: React.ReactNode
  /** 主标题 */
  title?: string
  /** 副标题或返回按钮等 */
  extra?: React.ReactNode
}

/**
 * 应用布局外壳
 * - 顶部导航：logo + 链接组 + 主题切换
 * - 内容区域：children
 */
export function AppShell({ children, title, extra }: AppShellProps) {
  const settings = useSettingsValue()
  const setSettings = useSetSettings()
  const { points, streak } = usePointsValue()
  const { streakDays, todayCompleted } = useDailyStreakValue()
  const location = useLocation()
  const [yearCalendarOpen, setYearCalendarOpen] = React.useState(false)

  // 积分增减浮动提示
  const prevPointsRef = React.useRef(points)
  const floatRef = React.useRef<HTMLSpanElement | null>(null)
  const [floatDelta, setFloatDelta] = React.useState<{
    value: number
    key: number
  } | null>(null)

  // 积分变动反馈：仅当 points 真正变化时触发（浮动提示 + 数字跳动）
  // 挂载时 prev 初始为当前值，比较相等不触发；对 StrictMode 双调 effect 也免疫
  const [bump, setBump] = React.useState(false)
  React.useEffect(() => {
    const prev = prevPointsRef.current
    if (points !== prev) {
      setFloatDelta({ value: points - prev, key: Date.now() })
      prevPointsRef.current = points
      setBump(true)
      const t = setTimeout(() => setBump(false), 450)
      return () => clearTimeout(t)
    }
  }, [points])

  // 用 Web Animations API 播放上浮淡出动画（支持自定义曲线与更多参数）
  React.useEffect(() => {
    const el = floatRef.current
    if (!el || !floatDelta) return
    if (typeof el.animate !== 'function') return
    const anim = el.animate(
      [
        { top: '10%', opacity: 0 },
        { top: '0%', opacity: 1, offset: 0.2 },
        { top: '-20%', opacity: 1, offset: 0.8 },
        { top: '-30%', opacity: 0 },
      ],
      {
        duration: 900,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'forwards',
      },
    )
    return () => anim.cancel()
  }, [floatDelta])

  const toggleDark = () => {
    const next = !settings.darkMode
    setSettings({ ...settings, darkMode: next })
    document.documentElement.classList.toggle('dark', next)
  }

  // 初始化主题
  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.darkMode)
  }, [settings.darkMode])

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold select-none">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground overflow-hidden">
              <Logo size={28} className="fill-current" />
            </span>
            <span className="hidden min-[360px]:inline">回响</span>
          </Link>
          <nav className="flex flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {NAV.map((item) => {
              const active =
                item.to === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(item.to)
              const Icon = item.icon
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  title={item.label}
                  className={cn(
                    // 断点适配：<sm 仅图标（文字在光标提示）；sm~lg icon 在上文字在下；lg+ icon 在左文字在右
                    'inline-flex flex-col items-center gap-0.5 rounded-md px-2 py-1 text-sm font-medium transition-colors',
                    'lg:flex-row lg:gap-1 lg:px-2.5 lg:py-1.5',
                    active
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden text-[10px] leading-none sm:block lg:text-sm lg:leading-normal">
                    {item.label}
                  </span>
                </Link>
              )
            })}
          </nav>
          {/* 右侧功能组：桌面整体右对齐；移动端「连胜+积分」居中、「GitHub+主题」在右 */}
          <div className="ml-auto flex items-center gap-4">
            <div className="flex items-center gap-4">
              <CalendarPopover
                trigger={
                  <button
                    type="button"
                    onClick={() => setYearCalendarOpen(true)}
                    className="flex items-center gap-1.5 rounded px-1 py-0.5 text-sm font-semibold tabular-nums transition-colors hover:bg-accent"
                    title={`连续答题 ${streakDays} 天 · 点击查看年打卡日历`}
                  >
                    <Flame
                      className={cn(
                        'h-4 w-4',
                        !todayCompleted && 'text-muted-foreground',
                      )}
                      style={
                        todayCompleted
                          ? { color: flameColor(streakDays) }
                          : undefined
                      }
                    />
                    <span>{streakDays}</span>
                  </button>
                }
              />
              <div
                className="flex items-center gap-1.5 text-sm font-semibold tabular-nums"
                title={`累计积分 ${points} · 连续答对 ${streak} 题`}
              >
                <Coins className="h-4 w-4 text-amber-500" />
                <span
                  key={points}
                  className={cn(
                    'relative inline-block',
                    bump && 'animate-[points-bump_0.4s_ease-out]',
                  )}
                >
                  {points}
                  {floatDelta && (
                    <span
                      key={floatDelta.key}
                      ref={floatRef}
                      className={cn(
                        'pointer-events-none absolute left-full whitespace-nowrap text-xs font-bold',
                        floatDelta.value >= 0
                          ? 'text-emerald-500'
                          : 'text-red-500',
                      )}
                    >
                      {floatDelta.value > 0
                        ? `+${floatDelta.value}`
                        : floatDelta.value}
                    </span>
                  )}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a
                href="https://github.com/planegenes/Echo"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub 仓库"
                title="GitHub 仓库"
                className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                </svg>
              </a>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleDark}
                aria-label="切换主题"
              >
                {settings.darkMode ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 py-6">
          {(title || extra) && (
            <div className="mb-4 flex items-center justify-between gap-4">
              {title && (
                <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
              )}
              {extra}
            </div>
          )}
          {children}
        </div>
      </main>

      <YearCalendarDialog
        open={yearCalendarOpen}
        onOpenChange={setYearCalendarOpen}
      />
    </div>
  )
}
