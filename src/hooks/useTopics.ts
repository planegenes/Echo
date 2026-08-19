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
  reorderTopics as reorderTopicsAtom,
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
        // 排到当前末尾
        order: topics.length,
      }
      await persistTopic(topic)
      if (type === 'pairs') setActivePairsTopicId(topic.id)
      else if (type === 'texts') setActiveTextsTopicId(topic.id)
      else setActiveSentencesTopicId(topic.id)
      return topic
    },
    [topics.length, setActivePairsTopicId, setActiveTextsTopicId, setActiveSentencesTopicId],
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

  /** 拖拽排序：接收全部专题的新顺序并持久化 */
  const reorderTopics = useCallback(
    async (ordered: Topic[]): Promise<void> => {
      await reorderTopicsAtom(ordered)
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
    reorderTopics,
  }
}
