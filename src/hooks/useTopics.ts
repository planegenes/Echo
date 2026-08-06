import { useCallback } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import type { Topic, TopicType } from '@/types'
import {
  topicsAtom,
  activePairsTopicAtom,
  activeTextsTopicAtom,
  activeSentencesTopicAtom,
  activePairsTopicIdAtom,
  activeTextsTopicIdAtom,
  activeSentencesTopicIdAtom,
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
  const activeSentencesTopic = useAtomValue(activeSentencesTopicAtom)
  const activePairsTopicId = useAtomValue(activePairsTopicIdAtom)
  const activeTextsTopicId = useAtomValue(activeTextsTopicIdAtom)
  const activeSentencesTopicId = useAtomValue(activeSentencesTopicIdAtom)
  const setActivePairsTopicId = useSetAtom(activePairsTopicIdAtom)
  const setActiveTextsTopicId = useSetAtom(activeTextsTopicIdAtom)
  const setActiveSentencesTopicId = useSetAtom(activeSentencesTopicIdAtom)

  const addTopic = useCallback(
    async (name: string, type: TopicType): Promise<Topic> => {
      const topic: Topic = {
        id: uid('topic'),
        name,
        type,
        pairs: [],
        texts: [],
        sentences: [],
      }
      await persistTopic(topic)
      if (type === 'pairs') setActivePairsTopicId(topic.id)
      else if (type === 'texts') setActiveTextsTopicId(topic.id)
      else setActiveSentencesTopicId(topic.id)
      return topic
    },
    [setActivePairsTopicId, setActiveTextsTopicId, setActiveSentencesTopicId],
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
    activeSentencesTopic,
    activePairsTopicId,
    activeTextsTopicId,
    activeSentencesTopicId,
    setActivePairsTopicId,
    setActiveTextsTopicId,
    setActiveSentencesTopicId,
    addTopic,
    renameTopic,
    removeTopic,
  }
}
