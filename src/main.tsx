import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider as JotaiProvider } from 'jotai'
import './index.css'
import App from './App.tsx'
import { appStore, loadPersistedData, topicsAtom, settingsAtom } from '@/store/atoms'
import { pointsAtom } from '@/store/points'
import { checkDailyStreakOnOpen, dailyStreakAtom, dayLogsAtom } from '@/store/dailyStreak'
import { snapshotUpdatedAtAtom } from '@/store/sync'
import { syncPull, scheduleSyncPush, isSyncing } from '@/lib/sync'
import { isWebDAVConfigured } from '@/lib/webdav'
import { setupPwa } from '@/lib/pwa'

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

  // 订阅题库 / 积分 / 连胜 / 打卡日志变化，记录修改时间并防抖推送（跳过同步自身触发的变更）
  const schedulePush = () => {
    if (isSyncing()) return
    appStore.set(snapshotUpdatedAtAtom, Date.now())
    scheduleSyncPush()
  }
  appStore.sub(topicsAtom, schedulePush)
  appStore.sub(pointsAtom, schedulePush)
  appStore.sub(dailyStreakAtom, schedulePush)
  appStore.sub(dayLogsAtom, schedulePush)

  // 每日连胜启动检查（修复漏一天或重置已断连胜）
  checkDailyStreakOnOpen(appStore)

  createRoot(rootEl).render(
    <StrictMode>
      <JotaiProvider store={appStore}>
        <App />
      </JotaiProvider>
    </StrictMode>,
  )

  // 注册 Service Worker，检测到新版本时提示刷新
  setupPwa()
})
