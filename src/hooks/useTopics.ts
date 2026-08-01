import { useCallback } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import type { Topic } from '@/types'
import {
  topicsAtom,
  activeTopicAtom,
  activeTopicIdAtom,
  persistTopic,
  deleteTopic,
} from '@/store/atoms'
import { uid } from '@/lib/utils'

/**
 * 专题管理 hook
 * - 专题的增删改名
 * - 切换活动专题
 */
export function useTopics() {
  const topics = useAtomValue(topicsAtom)
  const activeTopic = useAtomValue(activeTopicAtom)
  const activeTopicId = useAtomValue(activeTopicIdAtom)
  const setActiveTopicId = useSetAtom(activeTopicIdAtom)

  const addTopic = useCallback(
    async (name: string): Promise<Topic> => {
      const topic: Topic = { id: uid('topic'), name, pairs: [], texts: [] }
      await persistTopic(topic)
      setActiveTopicId(topic.id)
      return topic
    },
    [setActiveTopicId],
  )

  const renameTopic = useCallback(
    async (id: string, name: string): Promise<void> => {
      const cur = topics.find((t) => t.id === id)
      if (!cur) return
      await persistTopic({ ...cur, name })
    },
    [topics],
  )

  const removeTopic = useCallback(
    async (id: string): Promise<void> => {
      await deleteTopic(id)
    },
    [],
  )

  return {
    topics,
    activeTopic,
    activeTopicId,
    setActiveTopicId,
    addTopic,
    renameTopic,
    removeTopic,
  }
}
