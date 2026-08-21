import { useCallback, useEffect, useState } from 'react'
import { useAtomValue } from 'jotai'
import { usePointsRecorder } from '@/hooks/usePoints'
import type { ChoiceDirection, Content, PairItem } from '@/types'
import { activeDeckAtom, persistPair } from '@/store/atoms'
import { clamp, sample } from '@/lib/utils'
import {
  MASTERY_CORRECT_BONUS,
  MASTERY_STREAK_BASE,
  clampMastery,
  masteryDeltaAfterWrongs,
  masteryOf,
  nextMastery,
  sampleWeight,
} from '@/lib/weight'
import { compareIgnorePunctuation } from '@/lib/sentence'

/**
 * 默写题引擎
 * - 从配对题中随机抽选（按熟练度加权，避开最近 3 题）
 * - 随机方向：显示一侧（随机取一项），要求输入另一侧的内容
 * - 另一侧有多项内容时，任填一项即判正确（满足一项即可）
 * - 答错可重试，重试次数计入 wrongCount；最终答对时熟练度增量 × 0.95^wrongCount
 * - 「看答案」视为放弃，与单选「不会做」一致，扣除一次熟练度
 */

export interface DictationSession {
  pair: PairItem
  direction: ChoiceDirection
  /** 展示的题目内容（left 或 right 中的随机一项） */
  prompt: Content
  /** 判定目标：另一侧的全部内容（任一项匹配即正确） */
  answers: Content[]
  input: string
  resolved: 'idle' | 'correct' | 'wrong' | 'revealed'
  /** 本题累计答错次数 */
  wrongCount: number
}

interface DictationState {
  session: DictationSession | null
  score: number
  errors: number
  /** 最近 3 题出现过的 pair id */
  recentPairIds: string[]
}

const CORRECT_HOLD_MS = 800

function pickQuestion(
  deck: PairItem[],
  recentPairIds: string[],
): DictationSession | null {
  if (deck.length === 0) return null
  const available = deck.filter((p) => !recentPairIds.includes(p.id))
  const pool = available.length > 0 ? available : deck
  const weights = pool.map((p) => sampleWeight(masteryOf(p)))
  const [pair] = weightedSampleN(pool, weights, 1)
  if (!pair) return null

  const direction: ChoiceDirection =
    Math.random() < 0.5 ? 'askLeft' : 'askRight'
  const promptSide = direction === 'askLeft' ? pair.left : pair.right
  const answerSide = direction === 'askLeft' ? pair.right : pair.left
  const prompt = sample(promptSide)
  if (!prompt || answerSide.length === 0) return null

  return {
    pair,
    direction,
    prompt,
    answers: answerSide,
    input: '',
    resolved: 'idle',
    wrongCount: 0,
  }
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

export function useDictationEngine() {
  const deck = useAtomValue(activeDeckAtom)
  const { queueResult } = usePointsRecorder()

  const [state, setState] = useState<DictationState>({
    session: null,
    score: 0,
    errors: 0,
    recentPairIds: [],
  })

  const next = useCallback(() => {
    setState((prev) => {
      const currentPairId = prev.session?.pair.id
      const recent = currentPairId
        ? [...prev.recentPairIds, currentPairId].slice(-3)
        : prev.recentPairIds
      const q = pickQuestion(deck, recent)
      if (!q) return { ...prev, session: null, recentPairIds: recent }
      return { ...prev, session: q, recentPairIds: recent }
    })
  }, [deck])

  const start = useCallback(() => {
    setState({ session: null, score: 0, errors: 0, recentPairIds: [] })
    next()
  }, [next])

  const setInput = useCallback((value: string) => {
    setState((prev) => {
      const s = prev.session
      if (!s || s.resolved === 'correct' || s.resolved === 'revealed') return prev
      return { ...prev, session: { ...s, input: value } }
    })
  }, [])

  const confirm = useCallback(() => {
    setState((prev) => {
      const s = prev.session
      if (!s || s.resolved === 'correct' || s.resolved === 'revealed') return prev
      const input = s.input.trim()
      if (!input) return prev

      const correct = s.answers.some((a) =>
        compareIgnorePunctuation(input, a.value),
      )
      const key = s.direction === 'askLeft' ? 'lr' : 'rl'
      const pair = deck.find((p) => p.id === s.pair.id)
      if (pair) {
        const cur = pair.stats?.[key] ?? 0
        if (correct) {
          queueResult(true)
          // 本题曾选错 x 次：最终答对的熟练度增量 =（0.5 × 1.1^连对次数）× 0.95^x
          const cs = pair.correctStreak ?? 0
          const base =
            MASTERY_CORRECT_BONUS * Math.pow(MASTERY_STREAK_BASE, cs)
          const delta = masteryDeltaAfterWrongs(base, s.wrongCount)
          const nm = {
            mastery: clampMastery(masteryOf(pair) + delta),
            correctStreak: (pair.correctStreak ?? 0) + 1,
            wrongStreak: 0,
          }
          const stats = {
            ...pair.stats,
            [key]: clamp(cur - 0.5, 0, Number.POSITIVE_INFINITY),
          } as PairItem['stats']
          void persistPair({ ...pair, stats, ...nm })
        } else {
          queueResult(false)
          const nm = nextMastery(pair, false)
          const stats = { ...pair.stats, [key]: cur + 1 } as PairItem['stats']
          void persistPair({ ...pair, stats, ...nm })
        }
      }

      return {
        ...prev,
        session: {
          ...s,
          input,
          resolved: correct ? 'correct' : 'wrong',
          wrongCount: correct ? s.wrongCount : s.wrongCount + 1,
        },
        score: prev.score + (correct ? 1 : 0),
        errors: prev.errors + (correct ? 0 : 1),
      }
    })
  }, [deck, queueResult])

  /** 「看答案」：视为放弃并揭示标准答案（若本题尚未扣过分，则扣一次错） */
  const reveal = useCallback(() => {
    setState((prev) => {
      const s = prev.session
      if (!s || s.resolved === 'correct' || s.resolved === 'revealed') return prev
      if (s.wrongCount === 0) {
        const pair = deck.find((p) => p.id === s.pair.id)
        if (pair) {
          const nm = nextMastery(pair, false)
          void persistPair({ ...pair, ...nm })
        }
      }
      return { ...prev, session: { ...s, resolved: 'revealed' } }
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

  const canPlay = deck.length > 0

  return {
    canPlay,
    deck,
    session: state.session,
    score: state.score,
    errors: state.errors,
    start,
    next,
    setInput,
    confirm,
    reveal,
  }
}
