import { useTopics } from '@/hooks/useTopics'
import { cn } from '@/lib/utils'

/**
 * 专题选择器
 * - 仅在存在多个专题时显示
 * - 用于测试页面切换当前测试的专题
 */
export function TopicSelector({ className }: { className?: string }) {
  const { topics, activeTopicId, setActiveTopicId } = useTopics()
  if (topics.length <= 1) return null
  return (
    <select
      value={activeTopicId ?? ''}
      onChange={(e) => setActiveTopicId(e.target.value || null)}
      className={cn(
        'rounded-md border bg-background px-3 py-1.5 text-sm',
        className,
      )}
    >
      {topics.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  )
}
