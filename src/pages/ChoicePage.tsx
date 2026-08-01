import { AppShell } from '@/components/AppShell'
import { ChoiceGame } from '@/components/ChoiceGame'
import { TopicSelector } from '@/components/TopicSelector'
import { useTopics } from '@/hooks/useTopics'

/**
 * 单选匹配页面
 */
export default function ChoicePage() {
  const { activePairsTopicId } = useTopics()
  return (
    <AppShell title="单选匹配" extra={<TopicSelector type="pairs" />}>
      <ChoiceGame key={activePairsTopicId ?? 'none'} />
    </AppShell>
  )
}
