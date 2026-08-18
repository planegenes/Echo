import { useCallback } from 'react'
import { useAtomValue } from 'jotai'
import type { PairItem } from '@/types'
import {
  activeDeckAtom,
  adjustPairMastery,
  persistDeck,
  persistPair,
  removePair as removePairAtom,
  resetAllPairs,
  resetPairMastery,
  resetPairStats,
} from '@/store/atoms'
import defaultPairs from '@/presets/default-pairs.json'

/**
 * 配对题库操作（操作活动专题）
 * - 与 IndexedDB 同步
 */
export function useDeck() {
  const deck = useAtomValue(activeDeckAtom)

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

  /** 手动调整熟练度（±0.5） */
  const adjustMastery = useCallback(async (id: string, delta: number) => {
    await adjustPairMastery(id, delta)
  }, [])

  /** 重置熟练度为 0 */
  const resetMastery = useCallback(async (id: string) => {
    await resetPairMastery(id)
  }, [])

  /** 批量替换（用于导入） */
  const replaceAll = useCallback(async (pairs: PairItem[]) => {
    await persistDeck(pairs)
  }, [])

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

  /** 恢复默认数据（替换活动专题的 pair） */
  const restoreDefaults = useCallback(async () => {
    const defaults = defaultPairs as PairItem[]
    await persistDeck(defaults)
  }, [])

  return {
    deck,
    add,
    update,
    remove,
    clearAll,
    resetStats,
    adjustMastery,
    resetMastery,
    replaceAll,
    mergeImport,
    restoreDefaults,
  }
}
