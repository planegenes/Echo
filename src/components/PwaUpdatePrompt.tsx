import { useAtom } from 'jotai'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  getUpdateServiceWorker,
  pwaUpdateAvailableAtom,
} from '@/store/pwa'

/**
 * PWA 更新提示条：检测到新版本时显示，点击「刷新」激活新版本并刷新页面。
 */
export function PwaUpdatePrompt() {
  const [available, setAvailable] = useAtom(pwaUpdateAvailableAtom)

  if (!available) return null

  const handleRefresh = () => {
    void getUpdateServiceWorker()?.(true)
  }

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
