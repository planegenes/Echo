import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider as JotaiProvider } from 'jotai'
import './index.css'
import App from './App.tsx'
import { appStore, loadPersistedData } from '@/store/atoms'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element #root not found')

// 等待 IndexedDB 数据加载完成后再渲染，避免 ManagePairsPage
// 在 deck 尚未填充时误判为"空"并触发 restoreDefaults 覆盖用户数据
void loadPersistedData().finally(() => {
  createRoot(rootEl).render(
    <StrictMode>
      <JotaiProvider store={appStore}>
        <App />
      </JotaiProvider>
    </StrictMode>,
  )
})
