import { useCallback } from 'react'
import { useAtom } from 'jotai'
import { settingsAtom } from '@/store/atoms'
import { persistSettings } from '@/store/atoms'
import type { AppSettings } from '@/types'

/**
 * 读取/修改设置
 * settingsAtom 已通过 atomWithStorage 自动同步到 localStorage
 * 这里额外同步到 IndexedDB（spec 第 4 节数据流向第 4 点）
 */
export function useSettings() {
  const [settings, setSettings] = useAtom(settingsAtom)

  const update = useCallback(
    async (patch: Partial<AppSettings>) => {
      const next = { ...settings, ...patch }
      setSettings(next)
      // 同步到 IndexedDB（非阻塞，失败不阻塞 UI）
      void persistSettings(next)
      // 主题切换需要立即应用
      if (patch.darkMode !== undefined) {
        document.documentElement.classList.toggle('dark', patch.darkMode)
      }
    },
    [settings, setSettings],
  )

  const reset = useCallback(async () => {
    const defaults: AppSettings = {
      soundEnabled: true,
      darkMode: false,
      // 旧字段清空
      aiEndpoint: '',
      aiApiKey: '',
      aiModel: '',
      aiProviders: [],
      defaultAiProviderId: null,
      defaultAiModel: 'gpt-4o-mini',
      webdavUrl: '',
      webdavUsername: '',
      webdavPassword: '',
    }
    setSettings(defaults)
    await persistSettings(defaults)
    document.documentElement.classList.remove('dark')
  }, [setSettings])

  return { settings, update, reset }
}
