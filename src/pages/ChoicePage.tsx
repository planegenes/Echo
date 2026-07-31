import { AppShell } from '@/components/AppShell'
import { ChoiceGame } from '@/components/ChoiceGame'

/**
 * 单选匹配页面
 */
export default function ChoicePage() {
  return (
    <AppShell title="单选匹配">
      <ChoiceGame />
    </AppShell>
  )
}
