import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider as JotaiProvider } from 'jotai'
import './index.css'
import App from './App.tsx'
import { appStore, loadPersistedData, topicsAtom, settingsAtom } from '@/store/atoms'
import { syncPull, scheduleSyncPush, isSyncing } from '@/lib/sync'
import { isWebDAVConfigured } from '@/lib/webdav'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element #root not found')

// 等待 IndexedDB 数据加载完成后再渲染，避免 ManagePairsPage
// 在 deck 尚未填充时误判为"空"并触发 restoreDefaults 覆盖用户数据
void loadPersistedData().finally(async () => {
  // WebDAV 启动拉取
  const settings = appStore.get(settingsAtom)
  if (isWebDAVConfigured(settings)) {
    try {
      await syncPull(settings)
    } catch (e) {
      console.warn('[WebDAV] 启动拉取失败:', e)
    }
  }

  // 订阅 topics 变化，防抖推送（跳过同步自身触发的变更）
  appStore.sub(topicsAtom, () => {
    if (isSyncing()) return
    scheduleSyncPush()
  })

  createRoot(rootEl).render(
    <StrictMode>
      <JotaiProvider store={appStore}>
        <App />
      </JotaiProvider>
    </StrictMode>,
  )
})
