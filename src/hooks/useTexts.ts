import { useCallback } from 'react'
import { useAtomValue } from 'jotai'
import type { TextItem } from '@/types'
import {
  activeTextsAtom,
  persistText,
  persistTexts,
  removeText as removeTextAtom,
  resetAllTexts,
} from '@/store/atoms'
import defaultTexts from '@/presets/default-texts.json'

/**
 * 文本库操作（操作活动专题）
 */
export function useTexts() {
  const texts = useAtomValue(activeTextsAtom)

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
  const replaceAll = useCallback(async (next: TextItem[]) => {
    await persistTexts(next)
  }, [])

  /** 合并导入（保留已有） */
  const mergeImport = useCallback(
    async (items: TextItem[]) => {
      const map = new Map(texts.map((t) => [t.id, t] as const))
      for (const t of items) map.set(t.id, t)
      const next = Array.from(map.values())
      await persistTexts(next)
    },
    [texts],
  )

  /** 恢复默认数据（替换活动专题的 text） */
  const restoreDefaults = useCallback(async () => {
    const defaults = defaultTexts as TextItem[]
    await persistTexts(defaults)
  }, [])

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
