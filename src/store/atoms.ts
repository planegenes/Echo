import { atom, createStore, useAtomValue, useSetAtom } from 'jotai'
import { atomWithDefault, atomWithStorage } from 'jotai/utils'
import type {
  AppSettings,
  PairItem,
  PairStats,
  TextItem,
} from '@/types'
import {
  dbBulkPutPairs,
  dbClearPairs,
  dbClearTexts,
  dbGetAllPairs,
  dbGetAllTexts,
  dbGetSetting,
  dbPutPair,
  dbPutText,
  dbSetSetting,
} from '@/lib/db'

/**
 * Jotai 全局状态
 * 详见 spec 第 4 节状态管理
 */

// ===== 持久化数据 =====

export const deckAtom = atom<PairItem[]>([])
export const textsAtom = atom<TextItem[]>([])

export const settingsAtom = atomWithStorage<AppSettings>('pair-quiz:settings', {
  soundEnabled: true,
  darkMode: false,
  aiEndpoint: '',
  aiApiKey: '',
})

// ===== 派生状态 =====

/** 根据错误次数计算权重的 pair 列表：weight = 1 + lr + rl */
export const weightedDeckAtom = atom((get) => {
  const deck = get(deckAtom)
  return deck.map((p) => ({
    pair: p,
    weight: 1 + (p.stats?.lr ?? 0) + (p.stats?.rl ?? 0),
  }))
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
  const texts = get(textsAtom)
  return texts.find((t) => t.id === id) ?? null
})

// ===== 初始化 =====

/** 应用启动时从 IndexedDB 加载数据到 atom */
export async function loadPersistedData(): Promise<void> {
  const [pairs, texts] = await Promise.all([dbGetAllPairs(), dbGetAllTexts()])
  storeSet(deckAtom, pairs)
  storeSet(textsAtom, texts)
}

// ===== 与 IndexedDB 同步的小工具 =====

// Jotai 没有提供外部 setter，这里通过模块级 store 来 set
// 导出该 store 供 main.tsx 通过 <Provider store={appStore}> 使用，
// 保证外部 setter 写入与 React 读取使用同一个 store
export const appStore = createStore()
const internalStore = appStore

function storeSet<T>(anAtom: import('jotai').PrimitiveAtom<T>, value: T): void {
  internalStore.set(anAtom, value)
}

/** 把 deck 同步回 IndexedDB 与 atom */
export async function persistDeck(pairs: PairItem[]): Promise<void> {
  await dbBulkPutPairs(pairs)
  storeSet(deckAtom, pairs)
}

export async function persistPair(pair: PairItem): Promise<void> {
  await dbPutPair(pair)
  // 同步到 atom（基于当前 deck）
  const cur = internalStore.get(deckAtom)
  const idx = cur.findIndex((p) => p.id === pair.id)
  const next = cur.slice()
  if (idx === -1) next.push(pair)
  else next[idx] = pair
  storeSet(deckAtom, next)
}

export async function removePair(id: string): Promise<void> {
  const { dbDeletePair } = await import('@/lib/db')
  await dbDeletePair(id)
  const cur = internalStore.get(deckAtom)
  storeSet(deckAtom, cur.filter((p) => p.id !== id))
}

export async function persistText(text: TextItem): Promise<void> {
  await dbPutText(text)
  const cur = internalStore.get(textsAtom)
  const idx = cur.findIndex((t) => t.id === text.id)
  const next = cur.slice()
  if (idx === -1) next.push(text)
  else next[idx] = text
  storeSet(textsAtom, next)
}

export async function removeText(id: string): Promise<void> {
  await dbDeleteTextLite(id)
  const cur = internalStore.get(textsAtom)
  storeSet(textsAtom, cur.filter((t) => t.id !== id))
}

// 避免循环依赖，单独 import
async function dbDeleteTextLite(id: string): Promise<void> {
  const { dbDeleteText } = await import('@/lib/db')
  await dbDeleteText(id)
}

export async function resetAllPairs(): Promise<void> {
  await dbClearPairs()
  storeSet(deckAtom, [])
}

export async function resetAllTexts(): Promise<void> {
  await dbClearTexts()
  storeSet(textsAtom, [])
}

/** 重置某 pair 的学习记录 */
export async function resetPairStats(id: string): Promise<void> {
  const cur = internalStore.get(deckAtom)
  const pair = cur.find((p) => p.id === id)
  if (!pair) return
  const next: PairItem = { ...pair, stats: { lr: 0, rl: 0 } as PairStats }
  await persistPair(next)
}

/** 设置同步到 IndexedDB（settingsAtom 已自动 localStorage 持久化） */
export async function persistSettings(settings: AppSettings): Promise<void> {
  await dbSetSetting('settings', settings)
}

export async function loadSettingsFromDB(): Promise<AppSettings | undefined> {
  return dbGetSetting<AppSettings>('settings')
}

// ===== Hook 辅助（让组件更简洁） =====

export function useDeckValue(): PairItem[] {
  return useAtomValue(deckAtom)
}

export function useTextsValue(): TextItem[] {
  return useAtomValue(textsAtom)
}

export function useSettingsValue(): AppSettings {
  return useAtomValue(settingsAtom)
}

export function useSetDeck() {
  return useSetAtom(deckAtom)
}

export function useSetTexts() {
  return useSetAtom(textsAtom)
}

export function useSetSettings() {
  return useSetAtom(settingsAtom)
}
