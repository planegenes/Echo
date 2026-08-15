import { registerSW } from 'virtual:pwa-register'
import { appStore } from '@/store/atoms'
import { pwaUpdateAvailableAtom, setUpdateServiceWorker } from '@/store/pwa'

/**
 * 注册 Service Worker 并启用「检测到新版本」提示。
 * 新版本等待激活时把 pwaUpdateAvailableAtom 置为 true，
 * 由 PwaUpdatePrompt 组件展示刷新入口。
 */
export function setupPwa(): void {
  const updateSW = registerSW({
    onNeedRefresh() {
      appStore.set(pwaUpdateAvailableAtom, true)
    },
  })
  setUpdateServiceWorker(updateSW)
}
