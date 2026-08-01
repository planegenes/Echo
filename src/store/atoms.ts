import { atom, createStore, useAtomValue, useSetAtom } from 'jotai'
import { atomWithDefault, atomWithStorage } from 'jotai/utils'
import type {
  AppSettings,
  PairItem,
  PairStats,
  TextItem,
  Topic,
} from '@/types'
import {
  dbClearTopics,
  dbDeleteTopic,
  dbGetAllPairs,
  dbGetAllTexts,
  dbGetAllTopics,
  dbGetSetting,
  dbPutTopic,
  dbSetSetting,
} from '@/lib/db'
import defaultPairs from '@/presets/default-pairs.json'
import defaultTexts from '@/presets/default-texts.json'
import { uid } from '@/lib/utils'

/**
 * Jotai 全局状态
 * v2: 引入「专题」概念，所有题目存放在 Topic 之中
 */

// ===== 持久化数据 =====

export const topicsAtom = atom<Topic[]>([])

/** 当前选中的专题 id（持久化到 localStorage） */
export const activeTopicIdAtom = atomWithStorage<string | null>(
  'echo:activeTopic',
  null,
)

export const settingsAtom = atomWithStorage<AppSettings>('pair-quiz:settings', {
  soundEnabled: true,
  darkMode: false,
  aiEndpoint: '',
  aiApiKey: '',
})

// ===== 派生状态 =====

/** 当前活动专题（activeTopicId 未命中时回退到第一个） */
export const activeTopicAtom = atom((get) => {
  const topics = get(topicsAtom)
  const id = get(activeTopicIdAtom)
  return topics.find((t) => t.id === id) ?? topics[0] ?? null
})

/** 活动专题的配对题库 */
export const activeDeckAtom = atom((get) => {
  const topic = get(activeTopicAtom)
  return topic?.pairs ?? []
})

/** 活动专题的文本库 */
export const activeTextsAtom = atom((get) => {
  const topic = get(activeTopicAtom)
  return topic?.texts ?? []
})

/** 跨所有专题扁平化的文本列表（用于按 id 查找） */
export const allTextsAtom = atom((get) => {
  const topics = get(topicsAtom)
  return topics.flatMap((t) => t.texts)
})

// ===== 会话状态：模式一（左右配对） =====

export interface MatchSession {
  pairs: PairItem[]
  leftOrder: string[]
  rightOrder: string[]
  selectedLeft: string | null
  selectedRight: string | null
  matchedIds: string[]
  lastPairIds: string[]
}

export const matchSessionAtom = atom<MatchSession | null>(null)

// ===== 会话状态：模式二（单选匹配） =====

export interface ChoiceSession {
  pair: PairItem
  direction: 'askLeft' | 'askRight'
  /** 展示的题目内容（left 或 right） */
  prompt: { format: 'text' | 'latex'; value: string }
  /** 正确答案的 value */
  answerValue: string
  options: { id: string; value: string; format: 'text' | 'latex' }[]
  selectedId: string | null
  resolved: 'idle' | 'correct' | 'wrong'
}

export const choiceSessionAtom = atom<ChoiceSession | null>(null)

// ===== 会话状态：选词填空 =====

export interface FillSelectSession {
  textId: string
  /** 选项池：包含正确答案 + 干扰项，已打乱 */
  options: { id: string; value: string; used: boolean }[]
  /** blankId -> 已填入的选项 id（或 null） */
  filled: Record<string, string | null>
  confirmed: boolean
}

export const fillSelectSessionAtom = atom<FillSelectSession | null>(null)

// ===== 会话状态：填空模式（输入） =====

export interface FillInputSession {
  textId: string
  /** blankId -> 用户输入值 */
  inputs: Record<string, string>
  confirmed: boolean
}

export const fillInputSessionAtom = atom<FillInputSession | null>(null)

// ===== 当前选中的文本（用于派生解析） =====

export const currentTextIdAtom = atom<string | null>(null)

export const currentTextAtom = atomWithDefault<TextItem | null>((get) => {
  const id = get(currentTextIdAtom)
  if (!id) return null
  const texts = get(allTextsAtom)
  return texts.find((t) => t.id === id) ?? null
})

// ===== 初始化 =====

/** 应用启动时从 IndexedDB 加载数据到 atom */
export async function loadPersistedData(): Promise<void> {
  let topics = await dbGetAllTopics()
  if (topics.length === 0) {
    // 迁移：尝试从旧 pairs/texts 表读取
    const [oldPairs, oldTexts] = await Promise.all([
      dbGetAllPairs(),
      dbGetAllTexts(),
    ])
    const defaultTopic: Topic = {
      id: uid('topic'),
      name: '测试题库',
      pairs: oldPairs.length > 0
        ? oldPairs
        : (defaultPairs as PairItem[]),
      texts: oldTexts.length > 0
        ? oldTexts
        : (defaultTexts as TextItem[]),
    }
    await dbPutTopic(defaultTopic)
    topics = [defaultTopic]
  }
  storeSet(topicsAtom, topics)

  // 确保 activeTopicId 指向有效专题
  const stored = internalStore.get(activeTopicIdAtom)
  if (!stored || !topics.find((t) => t.id === stored)) {
    internalStore.set(activeTopicIdAtom, topics[0]?.id ?? null)
  }
}

// ===== 与 IndexedDB 同步的小工具 =====

export const appStore = createStore()
const internalStore = appStore

function storeSet<T>(anAtom: import('jotai').PrimitiveAtom<T>, value: T): void {
  internalStore.set(anAtom, value)
}

// ----- Topic 级别 -----

/** 新增或更新整个专题 */
export async function persistTopic(topic: Topic): Promise<void> {
  await dbPutTopic(topic)
  const cur = internalStore.get(topicsAtom)
  const idx = cur.findIndex((t) => t.id === topic.id)
  const next = cur.slice()
  if (idx === -1) next.push(topic)
  else next[idx] = topic
  storeSet(topicsAtom, next)
}

/** 删除专题（至少保留一个） */
export async function deleteTopic(id: string): Promise<void> {
  const cur = internalStore.get(topicsAtom)
  if (cur.length <= 1) return
  await dbDeleteTopic(id)
  const next = cur.filter((t) => t.id !== id)
  storeSet(topicsAtom, next)
  // 若删的是活动专题，切换到第一个
  if (internalStore.get(activeTopicIdAtom) === id) {
    internalStore.set(activeTopicIdAtom, next[0]?.id ?? null)
  }
}

/** 清空所有专题 */
export async function resetAllTopics(): Promise<void> {
  await dbClearTopics()
  storeSet(topicsAtom, [])
}

/** 批量替换所有专题（用于导入） */
export async function replaceAllTopics(newTopics: Topic[]): Promise<void> {
  await dbClearTopics()
  for (const t of newTopics) await dbPutTopic(t)
  storeSet(topicsAtom, newTopics)
  internalStore.set(activeTopicIdAtom, newTopics[0]?.id ?? null)
}

// ----- Pair 级别（操作活动专题）-----

function getActiveTopicId(): string | null {
  const topics = internalStore.get(topicsAtom)
  if (topics.length === 0) return null
  const id = internalStore.get(activeTopicIdAtom)
  return topics.find((t) => t.id === id) ? id : topics[0].id
}

/** 在活动专题中新增或更新 pair */
export async function persistPair(pair: PairItem): Promise<void> {
  const topicId = getActiveTopicId()
  if (!topicId) return
  const topics = internalStore.get(topicsAtom)
  const topic = topics.find((t) => t.id === topicId)
  if (!topic) return
  const idx = topic.pairs.findIndex((p) => p.id === pair.id)
  const nextPairs =
    idx === -1
      ? [...topic.pairs, pair]
      : topic.pairs.map((p) => (p.id === pair.id ? pair : p))
  await persistTopic({ ...topic, pairs: nextPairs })
}

/** 在活动专题中删除 pair */
export async function removePair(id: string): Promise<void> {
  const topicId = getActiveTopicId()
  if (!topicId) return
  const topics = internalStore.get(topicsAtom)
  const topic = topics.find((t) => t.id === topicId)
  if (!topic) return
  await persistTopic({
    ...topic,
    pairs: topic.pairs.filter((p) => p.id !== id),
  })
}

/** 清空活动专题的所有 pair */
export async function resetAllPairs(): Promise<void> {
  const topicId = getActiveTopicId()
  if (!topicId) return
  const topics = internalStore.get(topicsAtom)
  const topic = topics.find((t) => t.id === topicId)
  if (!topic) return
  await persistTopic({ ...topic, pairs: [] })
}

/** 重置活动专题中某 pair 的学习记录 */
export async function resetPairStats(id: string): Promise<void> {
  const topicId = getActiveTopicId()
  if (!topicId) return
  const topics = internalStore.get(topicsAtom)
  const topic = topics.find((t) => t.id === topicId)
  if (!topic) return
  const pair = topic.pairs.find((p) => p.id === id)
  if (!pair) return
  const next: PairItem = { ...pair, stats: { lr: 0, rl: 0 } as PairStats }
  await persistPair(next)
}

/** 批量替换活动专题的 pair（用于导入/恢复默认） */
export async function persistDeck(pairs: PairItem[]): Promise<void> {
  const topicId = getActiveTopicId()
  if (!topicId) return
  const topics = internalStore.get(topicsAtom)
  const topic = topics.find((t) => t.id === topicId)
  if (!topic) return
  await persistTopic({ ...topic, pairs })
}

// ----- Text 级别（操作活动专题）-----

/** 在活动专题中新增或更新 text */
export async function persistText(text: TextItem): Promise<void> {
  const topicId = getActiveTopicId()
  if (!topicId) return
  const topics = internalStore.get(topicsAtom)
  const topic = topics.find((t) => t.id === topicId)
  if (!topic) return
  const idx = topic.texts.findIndex((t) => t.id === text.id)
  const nextTexts =
    idx === -1
      ? [...topic.texts, text]
      : topic.texts.map((t) => (t.id === text.id ? text : t))
  await persistTopic({ ...topic, texts: nextTexts })
}

/** 在活动专题中删除 text */
export async function removeText(id: string): Promise<void> {
  const topicId = getActiveTopicId()
  if (!topicId) return
  const topics = internalStore.get(topicsAtom)
  const topic = topics.find((t) => t.id === topicId)
  if (!topic) return
  await persistTopic({
    ...topic,
    texts: topic.texts.filter((t) => t.id !== id),
  })
}

/** 清空活动专题的所有 text */
export async function resetAllTexts(): Promise<void> {
  const topicId = getActiveTopicId()
  if (!topicId) return
  const topics = internalStore.get(topicsAtom)
  const topic = topics.find((t) => t.id === topicId)
  if (!topic) return
  await persistTopic({ ...topic, texts: [] })
}

/** 批量替换活动专题的 text（用于导入/恢复默认） */
export async function persistTexts(texts: TextItem[]): Promise<void> {
  const topicId = getActiveTopicId()
  if (!topicId) return
  const topics = internalStore.get(topicsAtom)
  const topic = topics.find((t) => t.id === topicId)
  if (!topic) return
  await persistTopic({ ...topic, texts })
}

// ----- 跨专题查找文本 -----

/** 按 textId 在所有专题中查找所属文本与专题 */
export function findTextInTopics(
  topics: Topic[],
  textId: string,
): { text: TextItem; topic: Topic } | null {
  for (const topic of topics) {
    const text = topic.texts.find((t) => t.id === textId)
    if (text) return { text, topic }
  }
  return null
}

// ----- 设置 -----

/** 设置同步到 IndexedDB（settingsAtom 已自动 localStorage 持久化） */
export async function persistSettings(settings: AppSettings): Promise<void> {
  await dbSetSetting('settings', settings)
}

export async function loadSettingsFromDB(): Promise<AppSettings | undefined> {
  return dbGetSetting<AppSettings>('settings')
}

// ===== Hook 辅助 =====

export function useSettingsValue(): AppSettings {
  return useAtomValue(settingsAtom)
}

export function useSetSettings() {
  return useSetAtom(settingsAtom)
}
