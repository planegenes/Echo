import { atom, createStore, useAtomValue, useSetAtom } from 'jotai'
import { atomWithDefault, atomWithStorage } from 'jotai/utils'
import type {
  AppSettings,
  ContentFormat,
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
 * v2: 引入「专题」概念，每个专题为配对或填空类型
 */

// ===== 持久化数据 =====

export const topicsAtom = atom<Topic[]>([])

/** 当前选中的配对专题 id */
export const activePairsTopicIdAtom = atomWithStorage<string | null>(
  'echo:activePairsTopic',
  null,
)

/** 当前选中的填空专题 id */
export const activeTextsTopicIdAtom = atomWithStorage<string | null>(
  'echo:activeTextsTopic',
  null,
)

export const settingsAtom = atomWithStorage<AppSettings>('pair-quiz:settings', {
  soundEnabled: true,
  darkMode: false,
  aiEndpoint: '',
  aiApiKey: '',
})

// ===== 派生状态 =====

/** 当前活动的配对专题 */
export const activePairsTopicAtom = atom((get) => {
  const topics = get(topicsAtom)
  const id = get(activePairsTopicIdAtom)
  const found = topics.find((t) => t.id === id && t.type === 'pairs')
  return found ?? topics.find((t) => t.type === 'pairs') ?? null
})

/** 当前活动的填空专题 */
export const activeTextsTopicAtom = atom((get) => {
  const topics = get(topicsAtom)
  const id = get(activeTextsTopicIdAtom)
  const found = topics.find((t) => t.id === id && t.type === 'texts')
  return found ?? topics.find((t) => t.type === 'texts') ?? null
})

/** 活动配对专题的题库 */
export const activeDeckAtom = atom((get) => {
  const topic = get(activePairsTopicAtom)
  return topic?.pairs ?? []
})

/** 活动填空专题的文本库 */
export const activeTextsAtom = atom((get) => {
  const topic = get(activeTextsTopicAtom)
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
  prompt: { format: ContentFormat; value: string }
  /** 正确答案的 value */
  answerValue: string
  options: { id: string; value: string; format: ContentFormat }[]
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

  // 迁移：旧数据无 type 字段 → 拆分为配对/填空两个专题
  if (topics.length > 0 && !(topics[0] as { type?: string }).type) {
    const newTopics: Topic[] = []
    for (const old of topics) {
      if (old.pairs.length > 0) {
        newTopics.push({
          id: uid('topic'),
          name: old.name + '（配对）',
          type: 'pairs',
          pairs: old.pairs,
          texts: [],
        })
      }
      if (old.texts.length > 0) {
        newTopics.push({
          id: uid('topic'),
          name: old.name + '（填空）',
          type: 'texts',
          pairs: [],
          texts: old.texts,
        })
      }
    }
    await dbClearTopics()
    for (const t of newTopics) await dbPutTopic(t)
    topics = newTopics
  }

  if (topics.length === 0) {
    // 从旧 pairs/texts 表迁移，或加载默认题库
    const [oldPairs, oldTexts] = await Promise.all([
      dbGetAllPairs(),
      dbGetAllTexts(),
    ])
    const pairsTopic: Topic = {
      id: uid('topic'),
      name: '测试题库（配对）',
      type: 'pairs',
      pairs: oldPairs.length > 0 ? oldPairs : (defaultPairs as PairItem[]),
      texts: [],
    }
    const textsTopic: Topic = {
      id: uid('topic'),
      name: '测试题库（填空）',
      type: 'texts',
      pairs: [],
      texts: oldTexts.length > 0 ? oldTexts : (defaultTexts as TextItem[]),
    }
    await dbPutTopic(pairsTopic)
    await dbPutTopic(textsTopic)
    topics = [pairsTopic, textsTopic]
  }
  storeSet(topicsAtom, topics)

  // 确保活动专题 id 指向有效专题
  const pairsTopics = topics.filter((t) => t.type === 'pairs')
  const textsTopics = topics.filter((t) => t.type === 'texts')
  const storedPairs = internalStore.get(activePairsTopicIdAtom)
  if (!storedPairs || !pairsTopics.find((t) => t.id === storedPairs)) {
    internalStore.set(activePairsTopicIdAtom, pairsTopics[0]?.id ?? null)
  }
  const storedTexts = internalStore.get(activeTextsTopicIdAtom)
  if (!storedTexts || !textsTopics.find((t) => t.id === storedTexts)) {
    internalStore.set(activeTextsTopicIdAtom, textsTopics[0]?.id ?? null)
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

/** 删除专题（至少保留一个同类型专题） */
export async function deleteTopic(id: string): Promise<void> {
  const cur = internalStore.get(topicsAtom)
  const topic = cur.find((t) => t.id === id)
  if (!topic) return
  // 同类型至少保留一个
  const sameType = cur.filter((t) => t.type === topic.type)
  if (sameType.length <= 1) return
  await dbDeleteTopic(id)
  const next = cur.filter((t) => t.id !== id)
  storeSet(topicsAtom, next)
  // 若删的是活动专题，切换到同类型的第一个
  if (topic.type === 'pairs' && internalStore.get(activePairsTopicIdAtom) === id) {
    const fallback = next.find((t) => t.type === 'pairs')
    internalStore.set(activePairsTopicIdAtom, fallback?.id ?? null)
  }
  if (topic.type === 'texts' && internalStore.get(activeTextsTopicIdAtom) === id) {
    const fallback = next.find((t) => t.type === 'texts')
    internalStore.set(activeTextsTopicIdAtom, fallback?.id ?? null)
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
  const firstPairs = newTopics.find((t) => t.type === 'pairs')
  const firstTexts = newTopics.find((t) => t.type === 'texts')
  internalStore.set(activePairsTopicIdAtom, firstPairs?.id ?? null)
  internalStore.set(activeTextsTopicIdAtom, firstTexts?.id ?? null)
}

// ----- Pair 级别（操作活动配对专题）-----

function getActivePairsTopicId(): string | null {
  const topics = internalStore.get(topicsAtom)
  const pairsTopics = topics.filter((t) => t.type === 'pairs')
  if (pairsTopics.length === 0) return null
  const id = internalStore.get(activePairsTopicIdAtom)
  return pairsTopics.find((t) => t.id === id) ? id : pairsTopics[0]!.id
}

/** 在活动配对专题中新增或更新 pair */
export async function persistPair(pair: PairItem): Promise<void> {
  const topicId = getActivePairsTopicId()
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

/** 在活动配对专题中删除 pair */
export async function removePair(id: string): Promise<void> {
  const topicId = getActivePairsTopicId()
  if (!topicId) return
  const topics = internalStore.get(topicsAtom)
  const topic = topics.find((t) => t.id === topicId)
  if (!topic) return
  await persistTopic({
    ...topic,
    pairs: topic.pairs.filter((p) => p.id !== id),
  })
}

/** 清空活动配对专题的所有 pair */
export async function resetAllPairs(): Promise<void> {
  const topicId = getActivePairsTopicId()
  if (!topicId) return
  const topics = internalStore.get(topicsAtom)
  const topic = topics.find((t) => t.id === topicId)
  if (!topic) return
  await persistTopic({ ...topic, pairs: [] })
}

/** 重置活动配对专题中某 pair 的学习记录 */
export async function resetPairStats(id: string): Promise<void> {
  const topicId = getActivePairsTopicId()
  if (!topicId) return
  const topics = internalStore.get(topicsAtom)
  const topic = topics.find((t) => t.id === topicId)
  if (!topic) return
  const pair = topic.pairs.find((p) => p.id === id)
  if (!pair) return
  const next: PairItem = { ...pair, stats: { lr: 0, rl: 0 } as PairStats }
  await persistPair(next)
}

/** 批量替换活动配对专题的 pair（用于导入/恢复默认） */
export async function persistDeck(pairs: PairItem[]): Promise<void> {
  const topicId = getActivePairsTopicId()
  if (!topicId) return
  const topics = internalStore.get(topicsAtom)
  const topic = topics.find((t) => t.id === topicId)
  if (!topic) return
  await persistTopic({ ...topic, pairs })
}

// ----- Text 级别（操作活动填空专题）-----

function getActiveTextsTopicId(): string | null {
  const topics = internalStore.get(topicsAtom)
  const textsTopics = topics.filter((t) => t.type === 'texts')
  if (textsTopics.length === 0) return null
  const id = internalStore.get(activeTextsTopicIdAtom)
  return textsTopics.find((t) => t.id === id) ? id : textsTopics[0]!.id
}

/** 在活动填空专题中新增或更新 text */
export async function persistText(text: TextItem): Promise<void> {
  const topicId = getActiveTextsTopicId()
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

/** 在活动填空专题中删除 text */
export async function removeText(id: string): Promise<void> {
  const topicId = getActiveTextsTopicId()
  if (!topicId) return
  const topics = internalStore.get(topicsAtom)
  const topic = topics.find((t) => t.id === topicId)
  if (!topic) return
  await persistTopic({
    ...topic,
    texts: topic.texts.filter((t) => t.id !== id),
  })
}

/** 清空活动填空专题的所有 text */
export async function resetAllTexts(): Promise<void> {
  const topicId = getActiveTextsTopicId()
  if (!topicId) return
  const topics = internalStore.get(topicsAtom)
  const topic = topics.find((t) => t.id === topicId)
  if (!topic) return
  await persistTopic({ ...topic, texts: [] })
}

/** 批量替换活动填空专题的 text（用于导入/恢复默认） */
export async function persistTexts(texts: TextItem[]): Promise<void> {
  const topicId = getActiveTextsTopicId()
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
