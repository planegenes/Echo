import { useCallback } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import type { Topic, TopicType } from '@/types'
import {
  topicsAtom,
  activePairsTopicAtom,
  activeTextsTopicAtom,
  activePairsTopicIdAtom,
  activeTextsTopicIdAtom,
  persistTopic,
  deleteTopic,
} from '@/store/atoms'
import { uid } from '@/lib/utils'

/**
 * 专题管理 hook
 * - 专题的增删改名
 * - 切换活动专题（按类型）
 */
export function useTopics() {
  const topics = useAtomValue(topicsAtom)
  const activePairsTopic = useAtomValue(activePairsTopicAtom)
  const activeTextsTopic = useAtomValue(activeTextsTopicAtom)
  const activePairsTopicId = useAtomValue(activePairsTopicIdAtom)
  const activeTextsTopicId = useAtomValue(activeTextsTopicIdAtom)
  const setActivePairsTopicId = useSetAtom(activePairsTopicIdAtom)
  const setActiveTextsTopicId = useSetAtom(activeTextsTopicIdAtom)

  const addTopic = useCallback(
    async (name: string, type: TopicType): Promise<Topic> => {
      const topic: Topic = {
        id: uid('topic'),
        name,
        type,
        pairs: type === 'pairs' ? [] : [],
        texts: type === 'texts' ? [] : [],
      }
      await persistTopic(topic)
      if (type === 'pairs') setActivePairsTopicId(topic.id)
      else setActiveTextsTopicId(topic.id)
      return topic
    },
    [setActivePairsTopicId, setActiveTextsTopicId],
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
    activePairsTopic,
    activeTextsTopic,
    activePairsTopicId,
    activeTextsTopicId,
    setActivePairsTopicId,
    setActiveTextsTopicId,
    addTopic,
    renameTopic,
    removeTopic,
  }
}
