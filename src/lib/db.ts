import Dexie, { type Table } from 'dexie'
import type { PairItem, TextItem } from '@/types'

/**
 * IndexedDB 封装，使用 dexie.js
 * 详见 spec 第 9 节
 *
 * 注：DB 名 'pair-quiz-react' 保留以兼容旧版本用户数据
 */
export class RecallDB extends Dexie {
  pairs!: Table<PairItem, string>
  texts!: Table<TextItem, string>
  settings!: Table<{ key: string; value: unknown }, string>

  constructor() {
    super('pair-quiz-react')
    this.version(1).stores({
      pairs: 'id, left.format, right.format',
      texts: 'id',
      settings: 'key',
    })
  }
}

let _db: RecallDB | null = null

/** 获取单例 DB 实例 */
export function getDB(): RecallDB {
  if (_db) return _db
  _db = new RecallDB()
  return _db
}

// ===== Pairs =====

export async function dbGetAllPairs(): Promise<PairItem[]> {
  return getDB().pairs.toArray()
}

export async function dbPutPair(pair: PairItem): Promise<void> {
  await getDB().pairs.put(pair)
}

export async function dbBulkPutPairs(pairs: PairItem[]): Promise<void> {
  await getDB().pairs.bulkPut(pairs)
}

export async function dbDeletePair(id: string): Promise<void> {
  await getDB().pairs.delete(id)
}

export async function dbClearPairs(): Promise<void> {
  await getDB().pairs.clear()
}

// ===== Texts =====

export async function dbGetAllTexts(): Promise<TextItem[]> {
  return getDB().texts.toArray()
}

export async function dbPutText(text: TextItem): Promise<void> {
  await getDB().texts.put(text)
}

export async function dbDeleteText(id: string): Promise<void> {
  await getDB().texts.delete(id)
}

export async function dbClearTexts(): Promise<void> {
  await getDB().texts.clear()
}

// ===== Settings =====

export async function dbGetSetting<T>(key: string): Promise<T | undefined> {
  const row = await getDB().settings.get(key)
  return row?.value as T | undefined
}

export async function dbSetSetting<T>(key: string, value: T): Promise<void> {
  await getDB().settings.put({ key, value })
}
