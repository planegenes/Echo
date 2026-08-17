import { registerSW } from 'virtual:pwa-register'
import { appStore } from '@/store/atoms'
import {
  pwaUpdateAvailableAtom,
  pwaUpdatePhaseAtom,
  setUpdateServiceWorker,
  type PwaUpdatePhase,
} from '@/store/pwa'

/**
 * 注册 Service Worker 并启用「检测到新版本」提示。
 * - 监听 SW 更新状态机（downloading → installed → activating），
 *   驱动 PwaUpdatePrompt 的阶段进度条
 * - 新版本等待激活时把 pwaUpdateAvailableAtom 置为 true
 */
export function setupPwa(): void {
  const updateSW = registerSW({
    onNeedRefresh() {
      appStore.set(pwaUpdateAvailableAtom, true)
    },
  })
  setUpdateServiceWorker(updateSW)

  void watchUpdateProgress()
}

function setPhase(phase: PwaUpdatePhase): void {
  appStore.set(pwaUpdatePhaseAtom, phase)
}

/**
 * 监听 Service Worker 更新的阶段变化。
 * 浏览器不暴露下载字节进度，这里用状态机映射为阶段：
 * installing → 「正在下载更新」（不定进度条）；installed → 「新版本可用」；
 * activating → 「正在应用更新」；activated/redundant → 恢复空闲
 */
async function watchUpdateProgress(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) return

  const attach = (worker: ServiceWorker) => {
    if (worker.state === 'installing') setPhase('downloading')
    worker.addEventListener('statechange', () => {
      switch (worker.state) {
        case 'installing':
          setPhase('downloading')
          break
        case 'installed':
          setPhase('installed')
          break
        case 'activating':
          setPhase('activating')
          break
        case 'activated':
        case 'redundant':
          setPhase('idle')
          break
      }
    })
  }

  // 已存在的等待/安装中 worker
  const existing = registration.installing ?? registration.waiting
  if (existing) attach(existing)

  // 后续更新触发 updatefound 时
  registration.addEventListener('updatefound', () => {
    const newWorker = registration.installing
    if (newWorker) attach(newWorker)
  })
}
