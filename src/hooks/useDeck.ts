import { useCallback } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import type { PairItem } from '@/types'
import {
  deckAtom,
  persistDeck,
  persistPair,
  removePair as removePairAtom,
  resetAllPairs,
  resetPairStats,
} from '@/store/atoms'
import { dbBulkPutPairs } from '@/lib/db'
import defaultPairs from '@/presets/default-pairs.json'

/**
 * 配对题库操作
 * - 与 IndexedDB 同步
 * - 详见 spec 第 4、5、7 节
 */
export function useDeck() {
  const deck = useAtomValue(deckAtom)
  const setDeck = useSetAtom(deckAtom)

  const add = useCallback(async (pair: PairItem) => {
    await persistPair(pair)
  }, [])

  const update = useCallback(async (pair: PairItem) => {
    await persistPair(pair)
  }, [])

  const remove = useCallback(async (id: string) => {
    await removePairAtom(id)
  }, [])

  const clearAll = useCallback(async () => {
    await resetAllPairs()
  }, [])

  const resetStats = useCallback(async (id: string) => {
    await resetPairStats(id)
  }, [])

  /** 批量替换（用于导入） */
  const replaceAll = useCallback(
    async (pairs: PairItem[]) => {
      await resetAllPairs()
      await dbBulkPutPairs(pairs)
      setDeck(pairs)
    },
    [setDeck],
  )

  /** 合并导入（保留已有） */
  const mergeImport = useCallback(
    async (pairs: PairItem[]) => {
      const map = new Map(deck.map((p) => [p.id, p] as const))
      for (const p of pairs) map.set(p.id, p)
      const next = Array.from(map.values())
      await persistDeck(next)
    },
    [deck],
  )

  /** 恢复默认数据（替换） */
  const restoreDefaults = useCallback(async () => {
    await resetAllPairs()
    const defaults = defaultPairs as PairItem[]
    await dbBulkPutPairs(defaults)
    setDeck(defaults)
  }, [setDeck])

  return {
    deck,
    add,
    update,
    remove,
    clearAll,
    resetStats,
    replaceAll,
    mergeImport,
    restoreDefaults,
  }
}
