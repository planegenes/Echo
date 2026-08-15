import { RouterProvider } from 'react-router-dom'
import { router } from '@/routes'
import { DailyStreakRepairDialog } from '@/components/DailyStreakRepairDialog'
import { PwaUpdatePrompt } from '@/components/PwaUpdatePrompt'

/**
 * 应用根组件
 * - 路由通过 RouterProvider 注入
 * - Jotai Provider 在 main.tsx 中包裹
 */
export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <DailyStreakRepairDialog />
      <PwaUpdatePrompt />
    </>
  )
}
