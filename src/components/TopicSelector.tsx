import { useTopics } from '@/hooks/useTopics'
import { cn } from '@/lib/utils'
import type { TopicType } from '@/types'

/**
 * 专题选择器
 * - type="pairs": 只显示配对专题（用于配对测验/单选匹配）
 * - type="texts": 只显示填空专题（用于填空测验）
 * - 仅在存在多个同类型专题时显示
 */
export function TopicSelector({
  type,
  className,
}: {
  type: TopicType
  className?: string
}) {
  const { topics, activePairsTopicId, activeTextsTopicId, setActivePairsTopicId, setActiveTextsTopicId } = useTopics()
  const filtered = topics.filter((t) => t.type === type)
  if (filtered.length <= 1) return null

  const activeId = type === 'pairs' ? activePairsTopicId : activeTextsTopicId
  const setActive = type === 'pairs' ? setActivePairsTopicId : setActiveTextsTopicId

  return (
    <select
      value={activeId ?? ''}
      onChange={(e) => setActive(e.target.value || null)}
      className={cn(
        'rounded-md border bg-background px-3 py-1.5 text-sm',
        className,
      )}
    >
      {filtered.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  )
}
