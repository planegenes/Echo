import { createBrowserRouter, type RouteObject } from 'react-router-dom'
import HomePage from '@/pages/HomePage'
import MatchPage from '@/pages/MatchPage'
import ChoicePage from '@/pages/ChoicePage'
import ManagePairsPage from '@/pages/ManagePairsPage'
import ManageTextsPage from '@/pages/ManageTextsPage'
import FillSelectPage from '@/pages/FillSelectPage'
import FillInputPage from '@/pages/FillInputPage'
import SentenceTestPage from '@/pages/SentenceTestPage'
import SettingsPage from '@/pages/SettingsPage'

/**
 * 应用路由配置
 * - /               首页
 * - /match          配对测验
 * - /choice         单选匹配
 * - /manage         题库管理（配对 + 文本 + 组句）
 * - /texts          填空测验（随机抽取文本做填空）
 * - /fill/select/:textId  选词填空
 * - /fill/input/:textId   填空（输入）模式
 * - /sentences      组句 / 翻译 测验
 * - /settings       设置
 */
export const routes: RouteObject[] = [
  { path: '/', element: <HomePage /> },
  { path: '/match', element: <MatchPage /> },
  { path: '/choice', element: <ChoicePage /> },
  { path: '/manage', element: <ManagePairsPage /> },
  { path: '/texts', element: <ManageTextsPage /> },
  { path: '/fill/select/:textId', element: <FillSelectPage /> },
  { path: '/fill/input/:textId', element: <FillInputPage /> },
  { path: '/sentences', element: <SentenceTestPage /> },
  { path: '/settings', element: <SettingsPage /> },
]

export const router = createBrowserRouter(routes)
