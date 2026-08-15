import { atom } from 'jotai'

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
