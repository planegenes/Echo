import { useCallback } from 'react'
import { useAtomValue } from 'jotai'
import type { SentenceItem } from '@/types'
import {
  activeSentencesAtom,
  persistSentence,
  persistSentences,
  removeSentence as removeSentenceAtom,
  resetAllSentences,
} from '@/store/atoms'

/**
 * 组句题目库操作（操作活动组句专题）
 */
export function useSentences() {
  const sentences = useAtomValue(activeSentencesAtom)

  const add = useCallback(async (sentence: SentenceItem) => {
    await persistSentence(sentence)
  }, [])

  const update = useCallback(async (sentence: SentenceItem) => {
    await persistSentence(sentence)
  }, [])

  const remove = useCallback(async (id: string) => {
    await removeSentenceAtom(id)
  }, [])

  const clearAll = useCallback(async () => {
    await resetAllSentences()
  }, [])

  /** 批量替换（用于导入） */
  const replaceAll = useCallback(async (next: SentenceItem[]) => {
    await persistSentences(next)
  }, [])

  /** 合并导入（保留已有） */
  const mergeImport = useCallback(
    async (items: SentenceItem[]) => {
      const map = new Map(sentences.map((s) => [s.id, s] as const))
      for (const s of items) map.set(s.id, s)
      const next = Array.from(map.values())
      await persistSentences(next)
    },
    [sentences],
  )

  return {
    sentences,
    add,
    update,
    remove,
    clearAll,
    replaceAll,
    mergeImport,
  }
}
