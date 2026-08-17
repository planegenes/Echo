import { atom } from 'jotai'

/** PWA 更新阶段（驱动更新进度条） */
export type PwaUpdatePhase =
  | 'idle'
  | 'downloading'
  | 'installed'
  | 'activating'

/** 当前 PWA 更新阶段 */
export const pwaUpdatePhaseAtom = atom<PwaUpdatePhase>('idle')

/** 是否有 PWA 新版本等待刷新 */
export const pwaUpdateAvailableAtom = atom(false)

/** 触发新版本激活并刷新页面的函数（由 setupPwa 注入） */
let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null = null

export function setUpdateServiceWorker(
  fn: (reloadPage?: boolean) => Promise<void>,
): void {
  updateServiceWorker = fn
}

export function getUpdateServiceWorker() {
  return updateServiceWorker
}
