import { AppShell } from '@/components/AppShell'
import { MatchGame } from '@/components/MatchGame'
import { TopicSelector } from '@/components/TopicSelector'
import { useTopics } from '@/hooks/useTopics'

/**
 * 配对测验页面
 */
export default function MatchPage() {
  const { activePairsTopicId } = useTopics()
  return (
    <AppShell title="配对测验" extra={<TopicSelector type="pairs" />}>
      <MatchGame key={activePairsTopicId ?? 'none'} />
    </AppShell>
  )
}
