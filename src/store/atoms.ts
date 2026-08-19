import { atom, createStore, useAtomValue, useSetAtom } from 'jotai'
import { atomWithDefault, atomWithStorage } from 'jotai/utils'
import type {
  AppSettings,
  Content,
  ContentFormat,
  PairItem,
  PairStats,
  SentenceItem,
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
import defaultSentencesZh from '@/presets/default-sentences-zh.json'
import defaultSentencesYue from '@/presets/default-sentences-yue.json'
import defaultSentencesEn from '@/presets/default-sentences-en.json'
import { migrateLegacySettings, normalizeProvider } from '@/lib/ai-providers'
import { adjustMastery } from '@/lib/weight'
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

/** 当前选中的组句专题 id */
export const activeSentencesTopicIdAtom = atomWithStorage<string | null>(
  'echo:activeSentencesTopic',
  null,
)

export const settingsAtom = atomWithStorage<AppSettings>('pair-quiz:settings', {
  soundEnabled: true,
  darkMode: false,
  // 旧字段保留用于迁移检测，新代码不应再读取
  aiEndpoint: '',
  aiApiKey: '',
  aiModel: 'gpt-4o-mini',
  aiProviders: [],
  defaultAiProviderId: null,
  defaultAiModel: 'gpt-4o-mini',
  webdavUrl: '',
  webdavUsername: '',
  webdavPassword: '',
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

/** 当前活动的组句专题 */
export const activeSentencesTopicAtom = atom((get) => {
  const topics = get(topicsAtom)
  const id = get(activeSentencesTopicIdAtom)
  const found = topics.find((t) => t.id === id && t.type === 'sentences')
  return found ?? topics.find((t) => t.type === 'sentences') ?? null
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

/** 活动组句专题的题目库 */
export const activeSentencesAtom = atom((get) => {
  const topic = get(activeSentencesTopicAtom)
  return topic?.sentences ?? []
})

/** 跨所有专题扁平化的文本列表（用于按 id 查找） */
export const allTextsAtom = atom((get) => {
  const topics = get(topicsAtom)
  return topics.flatMap((t) => t.texts)
})

/** 跨所有专题扁平化的组句题目列表（用于按 id 查找） */
export const allSentencesAtom = atom((get) => {
  const topics = get(topicsAtom)
  return topics.flatMap((t) => t.sentences)
})

// ===== 会话状态：模式一（左右配对） =====

/** 配对测验中的一张卡片（一个 pair 可拆成多张卡片） */
export interface MatchCardRef {
  /** 卡片唯一 id（如 `${pairId}::L0`） */
  id: string
  /** 所属 pair id（左右同 pairId 即匹配正确） */
  pairId: string
  /** 卡片内容 */
  content: Content
}

export interface MatchSession {
  pairs: PairItem[]
  leftCards: MatchCardRef[]
  rightCards: MatchCardRef[]
  selectedLeft: string | null
  selectedRight: string | null
  matchedPairIds: string[]
  lastPairIds: string[]
}

export const matchSessionAtom = atom<MatchSession | null>(null)

// ===== 会话状态：模式二（单选匹配） =====

export interface ChoiceSession {
  pair: PairItem
  direction: 'askLeft' | 'askRight'
  /** 展示的题目内容（left 或 right 中的一项） */
  prompt: { format: ContentFormat; value: string }
  /** 正确答案所属的 pair id（组内任意项均正确） */
  answerPairId: string
  options: { id: string; value: string; format: ContentFormat; pairId: string }[]
  selectedId: string | null
  resolved: 'idle' | 'correct' | 'revealed'
  /** 是否通过「不会做」揭示答案（正确答案黄色高亮） */
  gaveUp?: boolean
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

/** 将旧版单个 Content 的 left/right 规范化为数组 */
function toContentArray(v: unknown): Content[] {
  return Array.isArray(v) ? (v as Content[]) : [v as Content]
}

function normalizePairArrays(topics: Topic[]): Topic[] {
  return topics.map((t) => ({
    ...t,
    pairs: t.pairs.map((p) => ({
      ...p,
      left: toContentArray(p.left),
      right: toContentArray(p.right),
    })),
  }))
}

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
          sentences: [],
        })
      }
      if (old.texts.length > 0) {
        newTopics.push({
          id: uid('topic'),
          name: old.name + '（填空）',
          type: 'texts',
          pairs: [],
          texts: old.texts,
          sentences: [],
        })
      }
    }
    await dbClearTopics()
    for (const t of newTopics) await dbPutTopic(t)
    topics = newTopics
  }

  // 兜底：为缺少 sentences 字段的旧专题补齐空数组
  let needsPersist = false
  topics = topics.map((t) => {
    if (!t.sentences) {
      needsPersist = true
      return { ...t, sentences: [] as SentenceItem[] }
    }
    return t
  })
  if (needsPersist) {
    await dbClearTopics()
    for (const t of topics) await dbPutTopic(t)
  }

  // 迁移：旧配对权重 w（0~100，默认 50）全部重置为熟练度 0，并一次性清除 w 字段
  let needsMasteryMigration = false
  topics = topics.map((t) => ({
    ...t,
    pairs: t.pairs.map((p) => {
      if (p.stats && p.stats.w !== undefined) {
        needsMasteryMigration = true
        const { w: _omit, ...rest } = p.stats
        return { ...p, stats: rest as PairStats, mastery: p.mastery ?? 0 }
      }
      return p
    }),
  }))
  if (needsMasteryMigration) {
    await dbClearTopics()
    for (const t of topics) await dbPutTopic(t)
  }

  // 迁移：为缺少 order 的旧专题按当前顺序补齐排序权重，并统一按 order 排序
  let needsOrderMigration = false
  topics = topics.map((t, i) => {
    if (t.order === undefined) {
      needsOrderMigration = true
      return { ...t, order: i }
    }
    return t
  })
  if (needsOrderMigration) {
    await dbClearTopics()
    for (const t of topics) await dbPutTopic(t)
  }
  topics.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

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
      sentences: [],
    }
    const textsTopic: Topic = {
      id: uid('topic'),
      name: '测试题库（填空）',
      type: 'texts',
      pairs: [],
      texts: oldTexts.length > 0 ? oldTexts : (defaultTexts as TextItem[]),
      sentences: [],
    }
    const sentencesZhTopic: Topic = {
      id: uid('topic'),
      name: '普通话组句',
      type: 'sentences',
      pairs: [],
      texts: [],
      sentences: defaultSentencesZh as SentenceItem[],
    }
    const sentencesYueTopic: Topic = {
      id: uid('topic'),
      name: '粤语组句',
      type: 'sentences',
      pairs: [],
      texts: [],
      sentences: defaultSentencesYue as SentenceItem[],
    }
    const sentencesEnTopic: Topic = {
      id: uid('topic'),
      name: '英语组句',
      type: 'sentences',
      pairs: [],
      texts: [],
      sentences: defaultSentencesEn as SentenceItem[],
    }
    await dbPutTopic(pairsTopic)
    await dbPutTopic(textsTopic)
    await dbPutTopic(sentencesZhTopic)
    await dbPutTopic(sentencesYueTopic)
    await dbPutTopic(sentencesEnTopic)
    topics = [pairsTopic, textsTopic, sentencesZhTopic, sentencesYueTopic, sentencesEnTopic]
  } else if (topics.filter((t) => t.type === 'sentences').length === 0) {
    // 已有专题但缺组句专题 → 补三个默认组句专题（普通话/粤语/英语）
    const sentencesZhTopic: Topic = {
      id: uid('topic'),
      name: '普通话组句',
      type: 'sentences',
      pairs: [],
      texts: [],
      sentences: defaultSentencesZh as SentenceItem[],
    }
    const sentencesYueTopic: Topic = {
      id: uid('topic'),
      name: '粤语组句',
      type: 'sentences',
      pairs: [],
      texts: [],
      sentences: defaultSentencesYue as SentenceItem[],
    }
    const sentencesEnTopic: Topic = {
      id: uid('topic'),
      name: '英语组句',
      type: 'sentences',
      pairs: [],
      texts: [],
      sentences: defaultSentencesEn as SentenceItem[],
    }
    await dbPutTopic(sentencesZhTopic)
    await dbPutTopic(sentencesYueTopic)
    await dbPutTopic(sentencesEnTopic)
    topics = [...topics, sentencesZhTopic, sentencesYueTopic, sentencesEnTopic]
  }
  // 数据结构升级：旧版 left/right 为单个 Content，规范化为数组
  topics = normalizePairArrays(topics)

  storeSet(topicsAtom, topics)

  // 确保活动专题 id 指向有效专题
  const pairsTopics = topics.filter((t) => t.type === 'pairs')
  const textsTopics = topics.filter((t) => t.type === 'texts')
  const sentencesTopics = topics.filter((t) => t.type === 'sentences')
  const storedPairs = internalStore.get(activePairsTopicIdAtom)
  if (!storedPairs || !pairsTopics.find((t) => t.id === storedPairs)) {
    internalStore.set(activePairsTopicIdAtom, pairsTopics[0]?.id ?? null)
  }
  const storedTexts = internalStore.get(activeTextsTopicIdAtom)
  if (!storedTexts || !textsTopics.find((t) => t.id === storedTexts)) {
    internalStore.set(activeTextsTopicIdAtom, textsTopics[0]?.id ?? null)
  }
  const storedSentences = internalStore.get(activeSentencesTopicIdAtom)
  if (!storedSentences || !sentencesTopics.find((t) => t.id === storedSentences)) {
    internalStore.set(activeSentencesTopicIdAtom, sentencesTopics[0]?.id ?? null)
  }

  // 迁移旧 AI 设置：单一 aiEndpoint/aiApiKey → 供应商列表
  await migrateLegacyAiSettingsIfNeeded()
  // 对账：localStorage 与 IndexedDB 两份设置副本可能漂移，恢复丢失的配置
  await reconcileSettings()
}

/**
 * 若 settings 仍是旧的单供应商结构，则迁移到 aiProviders + defaultAiProviderId
 * - 同时检查 IndexedDB 与 localStorage（settingsAtom）两处
 */
async function migrateLegacyAiSettingsIfNeeded(): Promise<void> {
  // 1. 检查 IndexedDB 中的 settings
  const dbSettings = await loadSettingsFromDB()
  if (dbSettings) {
    const needsMigrate =
      !dbSettings.aiProviders ||
      dbSettings.aiProviders.length === 0 ||
      !dbSettings.defaultAiModel ||
      dbSettings.aiProviders.some(
        (p) => !p.models || !p.modelConfigs,
      )
    if (needsMigrate) {
      const migrated = migrateLegacySettings(dbSettings)
      const next: AppSettings = {
        ...dbSettings,
        aiProviders: migrated.aiProviders.map(normalizeProvider),
        defaultAiProviderId: migrated.defaultAiProviderId,
        defaultAiModel: migrated.defaultAiModel,
      }
      await persistSettings(next)
    }
  }

  // 2. 检查 localStorage 中的 settingsAtom（同步迁移）
  const local = internalStore.get(settingsAtom)
  const needsLocalMigrate =
    !local.aiProviders ||
    local.aiProviders.length === 0 ||
    !local.defaultAiModel ||
    local.aiProviders.some((p) => !p.models || !p.modelConfigs)
  if (needsLocalMigrate) {
    const migrated = migrateLegacySettings(local)
    internalStore.set(settingsAtom, {
      ...local,
      aiProviders: migrated.aiProviders.map(normalizeProvider),
      defaultAiProviderId: migrated.defaultAiProviderId,
      defaultAiModel: migrated.defaultAiModel,
    })
  }
}

/** 判断设置里是否有"有意义"的配置（AI 供应商或 WebDAV），用于区分「未配置」与「已丢失」 */
function hasMeaningfulConfig(s: AppSettings): boolean {
  const hasProvider = (s.aiProviders ?? []).some(
    (p) => p.baseUrl.trim().length > 0 || p.apiKey.trim().length > 0,
  )
  const hasWebdav = !!(s.webdavUrl && s.webdavUsername)
  return hasProvider || hasWebdav
}

/**
 * 设置对账：settingsAtom 以 localStorage 为读取源，persistSettings 又会写入 IndexedDB，
 * 两份副本可能因浏览器只清 localStorage、或 IndexedDB 写入失败而漂移。
 * - 本地无配置而 DB 有 → 从 DB 恢复本地（修复「设置经常消失」）
 * - 本地有配置而 DB 无 → 回写 DB（补齐漂移）
 */
async function reconcileSettings(): Promise<void> {
  const local = internalStore.get(settingsAtom)
  const db = await loadSettingsFromDB()
  if (!db) return
  const localHas = hasMeaningfulConfig(local)
  const dbHas = hasMeaningfulConfig(db)
  if (!localHas && dbHas) {
    internalStore.set(settingsAtom, { ...db })
    await persistSettings(db)
  } else if (localHas && !dbHas) {
    await persistSettings(local)
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

/** 按给定顺序重排全部专题并持久化（题库管理拖拽排序） */
export async function reorderTopics(ordered: Topic[]): Promise<void> {
  const next = ordered.map((t, i) => ({ ...t, order: i }))
  await dbClearTopics()
  for (const t of next) await dbPutTopic(t)
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
  if (topic.type === 'sentences' && internalStore.get(activeSentencesTopicIdAtom) === id) {
    const fallback = next.find((t) => t.type === 'sentences')
    internalStore.set(activeSentencesTopicIdAtom, fallback?.id ?? null)
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
  // 兜底：导入数据可能缺少 sentences 字段
  const normalized = newTopics.map((t) => ({
    ...t,
    sentences: t.sentences ?? [],
  }))
  for (const t of normalized) await dbPutTopic(t)
  storeSet(topicsAtom, normalized)
  const firstPairs = normalized.find((t) => t.type === 'pairs')
  const firstTexts = normalized.find((t) => t.type === 'texts')
  const firstSentences = normalized.find((t) => t.type === 'sentences')
  internalStore.set(activePairsTopicIdAtom, firstPairs?.id ?? null)
  internalStore.set(activeTextsTopicIdAtom, firstTexts?.id ?? null)
  internalStore.set(activeSentencesTopicIdAtom, firstSentences?.id ?? null)
}

/** 替换所有专题但保留当前活动专题选择（用于 WebDAV 同步） */
export async function syncAllTopics(newTopics: Topic[]): Promise<void> {
  await dbClearTopics()
  const normalized = newTopics.map((t) => ({
    ...t,
    sentences: t.sentences ?? [],
  }))
  for (const t of normalized) await dbPutTopic(t)
  storeSet(topicsAtom, normalized)
  // 保留当前活动专题选择，仅在不指向有效专题时回退
  const pairsTopics = normalized.filter((t) => t.type === 'pairs')
  const textsTopics = normalized.filter((t) => t.type === 'texts')
  const sentencesTopics = normalized.filter((t) => t.type === 'sentences')
  const curPairs = internalStore.get(activePairsTopicIdAtom)
  if (!curPairs || !pairsTopics.find((t) => t.id === curPairs)) {
    internalStore.set(activePairsTopicIdAtom, pairsTopics[0]?.id ?? null)
  }
  const curTexts = internalStore.get(activeTextsTopicIdAtom)
  if (!curTexts || !textsTopics.find((t) => t.id === curTexts)) {
    internalStore.set(activeTextsTopicIdAtom, textsTopics[0]?.id ?? null)
  }
  const curSentences = internalStore.get(activeSentencesTopicIdAtom)
  if (!curSentences || !sentencesTopics.find((t) => t.id === curSentences)) {
    internalStore.set(activeSentencesTopicIdAtom, sentencesTopics[0]?.id ?? null)
  }
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

/** 重置活动配对专题中某 pair 的学习记录（错误统计 + 熟练度归零） */
export async function resetPairStats(id: string): Promise<void> {
  const topicId = getActivePairsTopicId()
  if (!topicId) return
  const topics = internalStore.get(topicsAtom)
  const topic = topics.find((t) => t.id === topicId)
  if (!topic) return
  const pair = topic.pairs.find((p) => p.id === id)
  if (!pair) return
  const next: PairItem = {
    ...pair,
    stats: { lr: 0, rl: 0 } as PairStats,
    mastery: 0,
    correctStreak: 0,
    wrongStreak: 0,
  }
  await persistPair(next)
}

/** 手动调整活动配对专题中某 pair 的熟练度（±0.5） */
export async function adjustPairMastery(
  id: string,
  delta: number,
): Promise<void> {
  const topicId = getActivePairsTopicId()
  if (!topicId) return
  const topics = internalStore.get(topicsAtom)
  const topic = topics.find((t) => t.id === topicId)
  if (!topic) return
  const pair = topic.pairs.find((p) => p.id === id)
  if (!pair) return
  await persistPair({ ...pair, mastery: adjustMastery(pair, delta) })
}

/** 重置活动配对专题中某 pair 的熟练度为 0（保留错误统计） */
export async function resetPairMastery(id: string): Promise<void> {
  const topicId = getActivePairsTopicId()
  if (!topicId) return
  const topics = internalStore.get(topicsAtom)
  const topic = topics.find((t) => t.id === topicId)
  if (!topic) return
  const pair = topic.pairs.find((p) => p.id === id)
  if (!pair) return
  await persistPair({
    ...pair,
    mastery: 0,
    correctStreak: 0,
    wrongStreak: 0,
  })
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

/** 手动调整活动填空专题中某 text 的熟练度（±0.5） */
export async function adjustTextMastery(
  id: string,
  delta: number,
): Promise<void> {
  const topicId = getActiveTextsTopicId()
  if (!topicId) return
  const topics = internalStore.get(topicsAtom)
  const topic = topics.find((t) => t.id === topicId)
  if (!topic) return
  const text = topic.texts.find((t) => t.id === id)
  if (!text) return
  await persistText({ ...text, mastery: adjustMastery(text, delta) })
}

/** 重置活动填空专题中某 text 的熟练度为 0 */
export async function resetTextMastery(id: string): Promise<void> {
  const topicId = getActiveTextsTopicId()
  if (!topicId) return
  const topics = internalStore.get(topicsAtom)
  const topic = topics.find((t) => t.id === topicId)
  if (!topic) return
  const text = topic.texts.find((t) => t.id === id)
  if (!text) return
  await persistText({
    ...text,
    mastery: 0,
    correctStreak: 0,
    wrongStreak: 0,
  })
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

/** 按 id 在所有专题中更新 text 的熟练度与连对/连错（不依赖活动专题，供游戏判题后调用） */
export async function updateTextMasteryById(
  id: string,
  patch: {
    mastery: number
    correctStreak: number
    wrongStreak: number
  },
): Promise<void> {
  const topics = internalStore.get(topicsAtom)
  const topic = topics.find((t) => t.texts.some((x) => x.id === id))
  if (!topic) return
  await persistTopic({
    ...topic,
    texts: topic.texts.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  })
}

// ----- Sentence 级别（操作活动组句专题）-----

function getActiveSentencesTopicId(): string | null {
  const topics = internalStore.get(topicsAtom)
  const sentencesTopics = topics.filter((t) => t.type === 'sentences')
  if (sentencesTopics.length === 0) return null
  const id = internalStore.get(activeSentencesTopicIdAtom)
  return sentencesTopics.find((t) => t.id === id) ? id : sentencesTopics[0]!.id
}

/** 在活动组句专题中新增或更新 sentence */
export async function persistSentence(sentence: SentenceItem): Promise<void> {
  const topicId = getActiveSentencesTopicId()
  if (!topicId) return
  const topics = internalStore.get(topicsAtom)
  const topic = topics.find((t) => t.id === topicId)
  if (!topic) return
  const idx = topic.sentences.findIndex((s) => s.id === sentence.id)
  const nextSentences =
    idx === -1
      ? [...topic.sentences, sentence]
      : topic.sentences.map((s) => (s.id === sentence.id ? sentence : s))
  await persistTopic({ ...topic, sentences: nextSentences })
}

/** 在活动组句专题中删除 sentence */
export async function removeSentence(id: string): Promise<void> {
  const topicId = getActiveSentencesTopicId()
  if (!topicId) return
  const topics = internalStore.get(topicsAtom)
  const topic = topics.find((t) => t.id === topicId)
  if (!topic) return
  await persistTopic({
    ...topic,
    sentences: topic.sentences.filter((s) => s.id !== id),
  })
}

/** 清空活动组句专题的所有 sentence */
export async function resetAllSentences(): Promise<void> {
  const topicId = getActiveSentencesTopicId()
  if (!topicId) return
  const topics = internalStore.get(topicsAtom)
  const topic = topics.find((t) => t.id === topicId)
  if (!topic) return
  await persistTopic({ ...topic, sentences: [] })
}

/** 批量替换活动组句专题的 sentence（用于导入/恢复默认） */
export async function persistSentences(sentences: SentenceItem[]): Promise<void> {
  const topicId = getActiveSentencesTopicId()
  if (!topicId) return
  const topics = internalStore.get(topicsAtom)
  const topic = topics.find((t) => t.id === topicId)
  if (!topic) return
  await persistTopic({ ...topic, sentences })
}

/** 手动调整活动组句专题中某 sentence 的熟练度（±0.5） */
export async function adjustSentenceMastery(
  id: string,
  delta: number,
): Promise<void> {
  const topicId = getActiveSentencesTopicId()
  if (!topicId) return
  const topics = internalStore.get(topicsAtom)
  const topic = topics.find((t) => t.id === topicId)
  if (!topic) return
  const sentence = topic.sentences.find((s) => s.id === id)
  if (!sentence) return
  await persistSentence({ ...sentence, mastery: adjustMastery(sentence, delta) })
}

/** 重置活动组句专题中某 sentence 的熟练度为 0 */
export async function resetSentenceMastery(id: string): Promise<void> {
  const topicId = getActiveSentencesTopicId()
  if (!topicId) return
  const topics = internalStore.get(topicsAtom)
  const topic = topics.find((t) => t.id === topicId)
  if (!topic) return
  const sentence = topic.sentences.find((s) => s.id === id)
  if (!sentence) return
  await persistSentence({
    ...sentence,
    mastery: 0,
    correctStreak: 0,
    wrongStreak: 0,
  })
}

// ----- 跨专题查找组句题目 -----

/** 按 sentenceId 在所有专题中查找所属题目与专题 */
export function findSentenceInTopics(
  topics: Topic[],
  sentenceId: string,
): { sentence: SentenceItem; topic: Topic } | null {
  for (const topic of topics) {
    const sentence = topic.sentences.find((s) => s.id === sentenceId)
    if (sentence) return { sentence, topic }
  }
  return null
}

/** 按 id 在所有专题中更新 sentence 的熟练度与连对/连错（不依赖活动专题，供游戏判题后调用） */
export async function updateSentenceMasteryById(
  id: string,
  patch: {
    mastery: number
    correctStreak: number
    wrongStreak: number
  },
): Promise<void> {
  const topics = internalStore.get(topicsAtom)
  const topic = topics.find((t) => t.sentences.some((x) => x.id === id))
  if (!topic) return
  await persistTopic({
    ...topic,
    sentences: topic.sentences.map((s) =>
      s.id === id ? { ...s, ...patch } : s,
    ),
  })
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
