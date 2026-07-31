import * as React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Home, Layers, FileText, BookOpen, Settings, Sun, Moon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSettingsValue, useSetSettings } from '@/store/atoms'

interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const NAV: NavItem[] = [
  { to: '/', label: '首页', icon: Home },
  { to: '/match', label: '配对', icon: Layers },
  { to: '/choice', label: '单选', icon: Layers },
  { to: '/texts', label: '填空', icon: FileText },
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
  const location = useLocation()

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
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground overflow-hidden">
              <svg width="28" height="28" viewBox="0 0 28 28" className="fill-current" aria-label="Echo">
                <text
                  x="14"
                  y="14"
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="16"
                  fontWeight="700"
                  textLength="16"
                  lengthAdjust="spacingAndGlyphs"
                >
                  <tspan fill="#41b349">E</tspan>
                  <tspan dx="2">c</tspan>
                  <tspan dx="2">h</tspan>
                  <tspan dx="2">o</tspan>
                </text>
              </svg>
            </span>
            <span className="hidden sm:inline">回响</span>
          </Link>
          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
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
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              )
            })}
          </nav>
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
    </div>
  )
}
