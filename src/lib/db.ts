import Dexie, { type Table } from 'dexie'
import type { PairItem, TextItem, Topic } from '@/types'

/**
 * IndexedDB 封装，使用 dexie.js
 *
 * v2: 引入 topics 表，pair/text 嵌入 Topic 之中
 * 旧 pairs/texts 表保留以兼容迁移
 */
export class RecallDB extends Dexie {
  topics!: Table<Topic, string>
  settings!: Table<{ key: string; value: unknown }, string>
  // 旧表（仅用于迁移读取）
  pairs!: Table<PairItem, string>
  texts!: Table<TextItem, string>

  constructor() {
    super('pair-quiz-react')
    this.version(1).stores({
      pairs: 'id, left.format, right.format',
      texts: 'id',
      settings: 'key',
    })
    this.version(2).stores({
      topics: 'id',
      pairs: 'id',
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

// ===== Topics =====

export async function dbGetAllTopics(): Promise<Topic[]> {
  return getDB().topics.toArray()
}

export async function dbPutTopic(topic: Topic): Promise<void> {
  await getDB().topics.put(topic)
}

export async function dbDeleteTopic(id: string): Promise<void> {
  await getDB().topics.delete(id)
}

export async function dbClearTopics(): Promise<void> {
  await getDB().topics.clear()
}

// ===== 旧 Pairs 表（仅迁移用）=====

export async function dbGetAllPairs(): Promise<PairItem[]> {
  return getDB().pairs.toArray()
}

// ===== 旧 Texts 表（仅迁移用）=====

export async function dbGetAllTexts(): Promise<TextItem[]> {
  return getDB().texts.toArray()
}

// ===== Settings =====

export async function dbGetSetting<T>(key: string): Promise<T | undefined> {
  const row = await getDB().settings.get(key)
  return row?.value as T | undefined
}

export async function dbSetSetting<T>(key: string, value: T): Promise<void> {
  await getDB().settings.put({ key, value })
}
