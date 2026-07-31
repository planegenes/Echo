import { useCallback } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import type { TextItem } from '@/types'
import {
  persistText,
  removeText as removeTextAtom,
  resetAllTexts,
  textsAtom,
} from '@/store/atoms'
import { dbPutText } from '@/lib/db'
import defaultTexts from '@/presets/default-texts.json'

/**
 * 文本库操作
 * - 与 IndexedDB 同步
 */
export function useTexts() {
  const texts = useAtomValue(textsAtom)
  const setTexts = useSetAtom(textsAtom)

  const add = useCallback(async (text: TextItem) => {
    await persistText(text)
  }, [])

  const update = useCallback(async (text: TextItem) => {
    await persistText(text)
  }, [])

  const remove = useCallback(async (id: string) => {
    await removeTextAtom(id)
  }, [])

  const clearAll = useCallback(async () => {
    await resetAllTexts()
  }, [])

  /** 批量替换（用于导入） */
  const replaceAll = useCallback(
    async (next: TextItem[]) => {
      await resetAllTexts()
      for (const t of next) await dbPutText(t)
      setTexts(next)
    },
    [setTexts],
  )

  /** 合并导入 */
  const mergeImport = useCallback(
    async (items: TextItem[]) => {
      const map = new Map(texts.map((t) => [t.id, t] as const))
      for (const t of items) map.set(t.id, t)
      const next = Array.from(map.values())
      for (const t of items) await dbPutText(t)
      setTexts(next)
    },
    [texts, setTexts],
  )

  /** 恢复默认数据 */
  const restoreDefaults = useCallback(async () => {
    await resetAllTexts()
    const defaults = defaultTexts as TextItem[]
    for (const t of defaults) await dbPutText(t)
    setTexts(defaults)
  }, [setTexts])

  return {
    texts,
    add,
    update,
    remove,
    clearAll,
    replaceAll,
    mergeImport,
    restoreDefaults,
  }
}
