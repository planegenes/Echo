import { AppShell } from '@/components/AppShell'
import { DictationGame } from '@/components/DictationGame'
import { TopicSelector } from '@/components/TopicSelector'
import { useTopics } from '@/hooks/useTopics'

/**
 * 默写测验页面：从配对题中随机抽选，输入另一侧内容
 */
export default function DictationPage() {
  const { activePairsTopicId } = useTopics()
  return (
    <AppShell title="默写测验" extra={<TopicSelector type="pairs" />}>
      <DictationGame key={activePairsTopicId ?? 'none'} />
    </AppShell>
  )
}
