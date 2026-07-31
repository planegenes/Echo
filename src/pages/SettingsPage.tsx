import { AppShell } from '@/components/AppShell'
import { SettingsForm } from '@/components/SettingsForm'
import { useSettings } from '@/hooks/useSettings'

/**
 * 应用设置页面
 */
export default function SettingsPage() {
  const settingsApi = useSettings()

  return (
    <AppShell title="设置">
      <SettingsForm
        settings={settingsApi.settings}
        onSubmit={(patch) => settingsApi.update(patch)}
        onReset={() => settingsApi.reset()}
      />
    </AppShell>
  )
}
