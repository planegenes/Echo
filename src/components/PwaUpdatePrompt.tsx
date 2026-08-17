import { useAtom } from 'jotai'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  getUpdateServiceWorker,
  pwaUpdateAvailableAtom,
  pwaUpdatePhaseAtom,
} from '@/store/pwa'

/**
 * PWA 更新提示条（按更新阶段渲染）
 * - downloading：不定进度条 + 「正在下载更新…」（浏览器不暴露字节进度，用阶段映射）
 * - activating：正在应用更新
 * - installed（available）：新版本可用，点击「刷新」激活并刷新页面
 */
export function PwaUpdatePrompt() {
  const [available, setAvailable] = useAtom(pwaUpdateAvailableAtom)
  const [phase] = useAtom(pwaUpdatePhaseAtom)

  const handleRefresh = () => {
    void getUpdateServiceWorker()?.(true)
  }

  // 下载中：进度条
  if (phase === 'downloading') {
    return (
      <div className="fixed bottom-4 left-1/2 z-50 w-80 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg border bg-popover px-4 py-3 text-popover-foreground shadow-lg animate-in fade-in slide-in-from-bottom-3 duration-300">
        <div className="mb-2 text-sm font-medium">正在下载更新…</div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 rounded-full bg-primary animate-[update-progress_1.2s_ease-in-out_infinite]" />
        </div>
      </div>
    )
  }

  // 正在应用更新
  if (phase === 'activating') {
    return (
      <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border bg-popover px-4 py-3 text-popover-foreground shadow-lg animate-in fade-in slide-in-from-bottom-3 duration-300">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm font-medium">正在应用更新…</span>
      </div>
    )
  }

  // 新版本可用，等待激活
  if (available) {
    return (
      <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border bg-popover px-4 py-3 text-popover-foreground shadow-lg animate-in fade-in slide-in-from-bottom-3 duration-300">
        <span className="text-sm font-medium">有新版本可用</span>
        <Button size="sm" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4" />
          刷新
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAvailable(false)}>
          稍后
        </Button>
      </div>
    )
  }

  return null
}
