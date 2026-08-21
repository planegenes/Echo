import { useCallback, useEffect, useState } from 'react'
import { useAtomValue } from 'jotai'
import { usePointsRecorder } from '@/hooks/usePoints'
import type { Content, ContentFormat, PairItem } from '@/types'
import { activeDeckAtom, persistPair, type ChoiceSession } from '@/store/atoms'
import { clamp, randInt, sample, sampleN, shuffle, uid } from '@/lib/utils'
import {
  MASTERY_CORRECT_BONUS,
  MASTERY_STREAK_BASE,
  clampMastery,
  masteryDeltaAfterWrongs,
  masteryOf,
  nextMastery,
  sampleWeight,
} from '@/lib/weight'
import type { ChoiceDirection } from '@/types'

/**
 * 模式二：单选匹配（两侧为数组，组内叉乘匹配）
 * - 上方随机显示 pair 一侧的一项
 * - 下方选项来自另一边（正确项 + 其它 pair 的干扰项）
 * - 判定：选项所属 pairId 与题目 pairId 相同即正确
 */

interface ChoiceOption {
  id: string
  value: string
  format: ContentFormat
  pairId: string
}

interface ChoiceEngineState {
  session: ChoiceSession | null
  score: number
  errors: number
  /** 长按标记为无关的 option id（可解除熄灭） */
  markedIrrelevantIds: string[]
  /** 答错后永久排除的 option id（不可解除熄灭） */
  eliminatedIds: string[]
  /** 刚答错的 option id（红色闪烁，随后转入 eliminatedIds） */
  justWrongId: string | null
  /** 刚答错选项对应的正确匹配内容（在选项上方短暂弹出） */
  wrongMatch: { optionId: string; content: Content } | null
  /** 最近 3 题出现过的 pair id */
  recentPairIds: string[]
}

const MIN_DECK = 2
/** 答对后自动进入下一题的延迟（毫秒） */
const CORRECT_HOLD_MS = 800
/** 答错后红色闪烁时长（毫秒） */
const WRONG_HOLD_MS = 500
/** 候选项（未熄灭）只剩该数量时停止答题并揭示答案 */
const MIN_CANDIDATES = 4

function pickQuestion(
  deck: PairItem[],
  recentPairIds: string[],
): {
  pair: PairItem
  direction: ChoiceDirection
  prompt: Content
  answerPairId: string
  options: ChoiceOption[]
} | null {
  if (deck.length < MIN_DECK) return null

  const available = deck.filter((p) => !recentPairIds.includes(p.id))
  const pool = available.length >= MIN_DECK ? available : deck

  const direction: ChoiceDirection = Math.random() < 0.5 ? 'askLeft' : 'askRight'
  const weights = pool.map((p) => sampleWeight(masteryOf(p)))

  const [pair] = weightedSampleN(pool, weights, 1)
  if (!pair) return null

  const promptSide = direction === 'askLeft' ? pair.left : pair.right
  const answerSide = direction === 'askLeft' ? pair.right : pair.left
  const promptItem = sample(promptSide)
  const correctItem = sample(answerSide)
  if (!promptItem || !correctItem) return null

  // 干扰项：其它 pair 的对边（拍平数组），按 value 去重
  const distractorPool: { content: Content; pairId: string }[] = []
  for (const p of deck) {
    if (p.id === pair.id) continue
    const side = direction === 'askLeft' ? p.right : p.left
    for (const c of side) distractorPool.push({ content: c, pairId: p.id })
  }
  const dedup = new Map<string, { content: Content; pairId: string }>()
  for (const d of distractorPool) {
    if (d.content.value === correctItem.value) continue
    if (!dedup.has(d.content.value)) dedup.set(d.content.value, d)
  }
  const uniqueDistractors = Array.from(dedup.values())

  const total = Math.max(2, Math.min(randInt(6, 10), deck.length))
  const numDistractors = Math.min(uniqueDistractors.length, total - 1)
  const distractors = sampleN(uniqueDistractors, numDistractors)

  const options: ChoiceOption[] = shuffle([
    {
      id: uid('opt'),
      value: correctItem.value,
      format: correctItem.format,
      pairId: pair.id,
    },
    ...distractors.map((d) => ({
      id: uid('opt'),
      value: d.content.value,
      format: d.content.format,
      pairId: d.pairId,
    })),
  ])

  return { pair, direction, prompt: promptItem, answerPairId: pair.id, options }
}

function weightedSampleN<T>(items: T[], weights: number[], n: number): T[] {
  const pool = items.slice()
  const poolWeights = weights.slice()
  const result: T[] = []
  for (let k = 0; k < n && pool.length > 0; k++) {
    const total = poolWeights.reduce((a, b) => a + b, 0)
    let r = Math.random() * total
    let idx = pool.length - 1
    for (let i = 0; i < pool.length; i++) {
      r -= poolWeights[i]
      if (r <= 0) {
        idx = i
        break
      }
    }
    result.push(pool[idx])
    pool.splice(idx, 1)
    poolWeights.splice(idx, 1)
  }
  return result
}

export function useChoiceEngine() {
  const deck = useAtomValue(activeDeckAtom)
  const { queueResult } = usePointsRecorder()

  const [state, setState] = useState<ChoiceEngineState>({
    session: null,
    score: 0,
    errors: 0,
    markedIrrelevantIds: [],
    eliminatedIds: [],
    justWrongId: null,
    wrongMatch: null,
    recentPairIds: [],
  })

  const applyStats = useCallback(
    (
      pairId: string,
      direction: ChoiceDirection,
      patch: (cur: number) => number,
      correct?: boolean,
      masteryDelta?: number,
    ) => {
      const pair = deck.find((p) => p.id === pairId)
      if (!pair) return
      const key = direction === 'askLeft' ? 'lr' : 'rl'
      const cur = pair.stats?.[key] ?? 0
      const next = patch(cur)
      // 熟练度：增量 × 1.1^连对/连错次数，同时更新连对连错计数；
      // 传入了 masteryDelta 时（本题曾选错，最终答对按 0.95^x 衰减）直接使用该增量
      const nm =
        masteryDelta !== undefined
          ? {
              mastery: clampMastery(masteryOf(pair) + masteryDelta),
              correctStreak: (pair.correctStreak ?? 0) + 1,
              wrongStreak: 0,
            }
          : correct === undefined
            ? {
                mastery: masteryOf(pair),
                correctStreak: pair.correctStreak ?? 0,
                wrongStreak: pair.wrongStreak ?? 0,
              }
            : nextMastery(pair, correct)
      const stats = { ...pair.stats, [key]: next } as PairItem['stats']
      void persistPair({ ...pair, stats, ...nm })
    },
    [deck],
  )

  const next = useCallback(() => {
    setState((prev) => {
      const currentPairId = prev.session?.pair.id
      const recent = currentPairId
        ? [...prev.recentPairIds, currentPairId].slice(-3)
        : prev.recentPairIds

      const q = pickQuestion(deck, recent)
      if (!q) {
        return { ...prev, session: null, markedIrrelevantIds: [], eliminatedIds: [], justWrongId: null, wrongMatch: null, recentPairIds: recent }
      }
      return {
        ...prev,
        session: {
          pair: q.pair,
          direction: q.direction,
          prompt: { format: q.prompt.format, value: q.prompt.value },
          answerPairId: q.answerPairId,
          options: q.options,
          selectedId: null,
          resolved: 'idle',
          wrongCount: 0,
        },
        markedIrrelevantIds: [],
        eliminatedIds: [],
        justWrongId: null,
        wrongMatch: null,
        recentPairIds: recent,
      }
    })
  }, [deck])

  const start = useCallback(() => {
    setState({ session: null, score: 0, errors: 0, markedIrrelevantIds: [], eliminatedIds: [], justWrongId: null, wrongMatch: null, recentPairIds: [] })
    next()
  }, [next])

  const selectOption = useCallback(
    (optionId: string) => {
      setState((prev) => {
        if (!prev.session || prev.session.resolved !== 'idle') return prev
        if (prev.justWrongId) return prev
        if (prev.eliminatedIds.includes(optionId)) return prev
        const option = prev.session.options.find((o) => o.id === optionId)
        if (!option) return prev
        // 组内叉乘：选项所属 pairId 与题目 pairId 一致即正确
        const correct = option.pairId === prev.session.answerPairId
        const direction = prev.session.direction
        applyStats(
          prev.session.pair.id,
          direction,
          (cur) =>
            correct
              ? clamp(cur - 0.5, 0, Number.POSITIVE_INFINITY)
              : cur + 1,
          correct,
        )
        const nextMarked = prev.markedIrrelevantIds.includes(optionId)
          ? prev.markedIrrelevantIds.filter((id) => id !== optionId)
          : prev.markedIrrelevantIds

        if (correct) {
          queueResult(true)
          // 先解构局部常量：属性访问链（prev.session）的窄化不会穿过 find 回调，
          // const 变量的窄化则可以（否则 TS18047: possibly null）
          const session = prev.session
          // 本题曾选错 x 次：最终答对的熟练度增量 =（0.5 × 1.1^连对次数）× 0.95^x
          const wrongCount = session.wrongCount ?? 0
          const cs = deck.find((p) => p.id === session.pair.id)
            ?.correctStreak ?? 0
          const base =
            MASTERY_CORRECT_BONUS * Math.pow(MASTERY_STREAK_BASE, cs)
          const delta = masteryDeltaAfterWrongs(base, wrongCount)
          applyStats(
            session.pair.id,
            direction,
            (cur) => clamp(cur - 0.5, 0, Number.POSITIVE_INFINITY),
            undefined,
            delta,
          )
          return {
            ...prev,
            session: { ...session, selectedId: optionId, resolved: 'correct' },
            score: prev.score + 1,
            markedIrrelevantIds: nextMarked,
          }
        }
        // 答错：记录该选项对应的正确匹配（其所属 pair 的另一侧内容），短暂弹出
        queueResult(false)
        const wrongPair = deck.find((p) => p.id === option.pairId)
        // 选项来自「答案侧」，其所属 pair 的「题目侧」才是正确匹配（修复方向颠倒）
        const matchSide =
          direction === 'askLeft' ? wrongPair?.left : wrongPair?.right
        const wrongMatch = matchSide ? sample(matchSide) ?? null : null
        return {
          ...prev,
          session: {
            ...prev.session,
            selectedId: optionId,
            wrongCount: (prev.session.wrongCount ?? 0) + 1,
          },
          errors: prev.errors + 1,
          justWrongId: optionId,
          wrongMatch: wrongMatch
            ? { optionId, content: wrongMatch }
            : null,
          markedIrrelevantIds: nextMarked,
        }
      })
    },
    [applyStats, queueResult, deck],
  )

  const toggleIrrelevant = useCallback((optionId: string) => {
    setState((prev) => {
      if (!prev.session || prev.session.resolved !== 'idle') return prev
      if (prev.justWrongId) return prev
      if (prev.eliminatedIds.includes(optionId)) return prev
      const exists = prev.markedIrrelevantIds.includes(optionId)
      const nextIds = exists
        ? prev.markedIrrelevantIds.filter((id) => id !== optionId)
        : [...prev.markedIrrelevantIds, optionId]
      return { ...prev, markedIrrelevantIds: nextIds }
    })
  }, [])

  // 答错红色闪烁后转入不可解除熄灭；若候选项只剩 4 个则停止并揭示答案
  useEffect(() => {
    const wrongId = state.justWrongId
    if (!wrongId) return
    const t = setTimeout(() => {
      setState((prev) => {
        if (!prev.session) return prev
        const eliminated = [...prev.eliminatedIds, wrongId]
        const marked = prev.markedIrrelevantIds.filter((id) => id !== wrongId)
        const candidates = prev.session.options.length - eliminated.length
        const resolved =
          candidates <= MIN_CANDIDATES ? 'revealed' : prev.session.resolved
        return {
          ...prev,
          eliminatedIds: eliminated,
          markedIrrelevantIds: marked,
          justWrongId: null,
          wrongMatch: null,
          session: { ...prev.session, resolved },
        }
      })
    }, WRONG_HOLD_MS)
    return () => clearTimeout(t)
  }, [state.justWrongId])

  /**
   * 「不会做」：所有未熄灭的选项视为答错，调高其所属 pair 的错误率权重（答错惩罚），
   * 黄色高亮正确答案并揭示本题
   */
  const giveUp = useCallback(() => {
    setState((prev) => {
      if (!prev.session || prev.session.resolved !== 'idle') return prev
      if (prev.justWrongId) return prev
      const activeOptions = prev.session.options.filter(
        (o) =>
          !prev.eliminatedIds.includes(o.id) &&
          !prev.markedIrrelevantIds.includes(o.id),
      )
      // 每个未熄灭选项所属 pair 各记一次答错（去重）
      const pairIds = [...new Set(activeOptions.map((o) => o.pairId))]
      for (const pid of pairIds) {
        const pair = deck.find((p) => p.id === pid)
        if (!pair) continue
        const nm = nextMastery(pair, false)
        void persistPair({ ...pair, ...nm })
      }
      return {
        ...prev,
        session: { ...prev.session, resolved: 'revealed', gaveUp: true },
      }
    })
  }, [deck])

  // 答对后自动进入下一题
  useEffect(() => {
    if (state.session?.resolved !== 'correct') return
    const t = setTimeout(() => {
      next()
    }, CORRECT_HOLD_MS)
    return () => clearTimeout(t)
  }, [state.session?.resolved, next])

  const canPlay = deck.length >= MIN_DECK

  return {
    canPlay,
    deck,
    session: state.session,
    score: state.score,
    errors: state.errors,
    markedIrrelevantIds: state.markedIrrelevantIds,
    eliminatedIds: state.eliminatedIds,
    justWrongId: state.justWrongId,
    wrongMatch: state.wrongMatch,
    start,
    next,
    selectOption,
    toggleIrrelevant,
    giveUp,
  }
}
