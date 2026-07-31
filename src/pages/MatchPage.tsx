import { AppShell } from '@/components/AppShell'
import { MatchGame } from '@/components/MatchGame'

/**
 * 配对测验页面
 */
export default function MatchPage() {
  return (
    <AppShell title="配对测验">
      <MatchGame />
    </AppShell>
  )
}
