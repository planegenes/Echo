import { useCallback, useEffect, useState } from 'react'
import { useAtomValue } from 'jotai'
import { usePointsRecorder } from '@/hooks/usePoints'
import type { Content, PairItem } from '@/types'
import {
  activeDeckAtom,
  persistPair,
  type MatchCardRef,
  type MatchSession,
} from '@/store/atoms'
import { clamp, sample, shuffle } from '@/lib/utils'
import { masteryOf, nextMastery, sampleWeight } from '@/lib/weight'

/**
 * 模式一：左右配对（两侧为数组，组内叉乘匹配）
 * - 每个 pair 的 left/right 每侧随机取一项做成卡片（多内容项每轮只出现随机一项）
 * - 判定：左右卡片所属 pairId 相同即正确（组内任意左项 ↔ 任意右项）
 * - 正确：该 pair 所有卡片变绿，其它淡出；0.6s 后自动开新回合
 * - 错误：直接揭示正确配对（变绿）并换新回合
 * - 长按标记为无关的卡片仍可点击选中（选中时自动解除标记），与单选一致
 */
const ROUND_SIZE = 4
const MATCH_HOLD_MS = 600

/** 困难模式：1 正确 + 4 左干扰 + 4 右干扰 = 9 组，每侧 5 选项 */
const HARD_TOTAL = 9

export type Difficulty = 'normal' | 'hard'

interface MatchEngineState {
  session: MatchSession | null
  score: number
  errors: number
  /** 刚选对的 pair id，用于触发「变绿淡出其他」动画 */
  justMatchedId: string | null
  /** 刚选错的两侧卡片 id，用于触发「变红」动画 */
  justWrongIds: { left: string; right: string } | null
  roundKey: number
  difficulty: Difficulty
  /** 本回合被长按标记为无关的卡片 id 列表（下回合自动清空） */
  markedIrrelevantIds: string[]
  /** 最近 3 回合出现过的 pair id */
  recentRounds: string[][]
}

interface HardPick {
  correct: PairItem
  leftDistractors: PairItem[]
  rightDistractors: PairItem[]
}

function pickRound(
  deck: PairItem[],
  recentPairIds: string[],
): PairItem[] | null {
  if (deck.length < ROUND_SIZE) return null
  const available = deck.filter((p) => !recentPairIds.includes(p.id))
  const pool = available.length >= ROUND_SIZE ? available : deck
  const weights = pool.map((p) => sampleWeight(masteryOf(p)))
  return weightedSampleN(pool, weights, ROUND_SIZE)
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

function cardRef(
  pairId: string,
  content: Content,
  side: 'left' | 'right',
  index: number,
): MatchCardRef {
  return {
    id: `${pairId}::${side === 'left' ? 'L' : 'R'}${index}`,
    pairId,
    content,
  }
}

function buildSession(pairs: PairItem[], lastPairIds: string[]): MatchSession {
  const leftCards: MatchCardRef[] = []
  const rightCards: MatchCardRef[] = []
  for (const p of pairs) {
    // 每侧随机取一项：多内容项（组内叉乘）每轮只出现随机一项，保证左右卡片数平衡
    const left = sample(p.left)
    const right = sample(p.right)
    if (left) leftCards.push(cardRef(p.id, left, 'left', 0))
    if (right) rightCards.push(cardRef(p.id, right, 'right', 0))
  }
  return {
    pairs,
    leftCards: shuffle(leftCards),
    rightCards: shuffle(rightCards),
    selectedLeft: null,
    selectedRight: null,
    matchedPairIds: [],
    lastPairIds,
  }
}

/** 困难模式抽取：1 正确 + 4 左干扰 + 4 右干扰 */
function pickRoundHard(
  deck: PairItem[],
  recentPairIds: string[],
): HardPick | null {
  if (deck.length < HARD_TOTAL) return null
  const available = deck.filter((p) => !recentPairIds.includes(p.id))
  const pool = available.length >= HARD_TOTAL ? available : deck
  const weights = pool.map((p) => sampleWeight(masteryOf(p)))
  const picks = weightedSampleN(pool, weights, HARD_TOTAL)
  return {
    correct: picks[0],
    leftDistractors: picks.slice(1, 5),
    rightDistractors: picks.slice(5, 9),
  }
}

function buildHardSession(
  pick: HardPick,
  lastPairIds: string[],
): MatchSession {
  const allPairs = [
    pick.correct,
    ...pick.leftDistractors,
    ...pick.rightDistractors,
  ]
  const leftCards: MatchCardRef[] = []
  const rightCards: MatchCardRef[] = []
  const correct = pick.correct
  // 正确 pair：左右各随机取一项，唯一能匹配的一对（组内任意项均可匹配）
  const correctLeft = sample(correct.left)
  const correctRight = sample(correct.right)
  if (correctLeft) leftCards.push(cardRef(correct.id, correctLeft, 'left', 0))
  if (correctRight) rightCards.push(cardRef(correct.id, correctRight, 'right', 0))
  pick.leftDistractors.forEach((p) => {
    const c = sample(p.left)
    if (c) leftCards.push(cardRef(p.id, c, 'left', 0))
  })
  pick.rightDistractors.forEach((p) => {
    const c = sample(p.right)
    if (c) rightCards.push(cardRef(p.id, c, 'right', 0))
  })
  return {
    pairs: allPairs,
    leftCards: shuffle(leftCards),
    rightCards: shuffle(rightCards),
    selectedLeft: null,
    selectedRight: null,
    matchedPairIds: [],
    lastPairIds,
  }
}

export function useMatchEngine() {
  const deck = useAtomValue(activeDeckAtom)
  const { queueResult } = usePointsRecorder()

  const [state, setState] = useState<MatchEngineState>({
    session: null,
    score: 0,
    errors: 0,
    justMatchedId: null,
    justWrongIds: null,
    roundKey: 0,
    difficulty: 'normal',
    markedIrrelevantIds: [],
    recentRounds: [],
  })

  const applyStats = useCallback(
    (
      pairId: string,
      patch: (cur: { lr: number; rl: number }) => { lr: number; rl: number },
      correct?: boolean,
    ) => {
      const pair = deck.find((p) => p.id === pairId)
      if (!pair) return
      const cur = { lr: pair.stats?.lr ?? 0, rl: pair.stats?.rl ?? 0 }
      const next = patch(cur)
      // 熟练度：增量 × 1.1^连对/连错次数，同时更新连对连错计数
      const nm =
        correct === undefined
          ? {
              mastery: masteryOf(pair),
              correctStreak: pair.correctStreak ?? 0,
              wrongStreak: pair.wrongStreak ?? 0,
            }
          : nextMastery(pair, correct)
      void persistPair({ ...pair, stats: { ...next }, ...nm })
    },
    [deck],
  )

  const start = useCallback(() => {
    setState((prev) => {
      const mode = prev.difficulty
      if (mode === 'hard') {
        if (deck.length < HARD_TOTAL) {
          return { ...prev, session: null, markedIrrelevantIds: [], recentRounds: [] }
        }
        const pick = pickRoundHard(deck, [])
        return {
          ...prev,
          session: pick ? buildHardSession(pick, []) : null,
          score: 0,
          errors: 0,
          justMatchedId: null,
          justWrongIds: null,
          roundKey: 1,
          markedIrrelevantIds: [],
          recentRounds: [],
        }
      }
      if (deck.length < ROUND_SIZE) {
        return { ...prev, session: null, markedIrrelevantIds: [], recentRounds: [] }
      }
      const picks = pickRound(deck, [])
      return {
        ...prev,
        session: picks ? buildSession(picks, []) : null,
        score: 0,
        errors: 0,
        justMatchedId: null,
        justWrongIds: null,
        roundKey: 1,
        markedIrrelevantIds: [],
        recentRounds: [],
      }
    })
  }, [deck])

  const nextRound = useCallback(() => {
    setState((prev) => {
      if (!prev.session) return prev
      const currentPairIds = prev.session.pairs.map((p) => p.id)
      const newRecent = [...prev.recentRounds, currentPairIds].slice(-3)
      const recentFlat = newRecent.flat()
      const lastIds = currentPairIds

      if (prev.difficulty === 'hard') {
        const pick = pickRoundHard(deck, recentFlat)
        if (!pick) return { ...prev, session: null, markedIrrelevantIds: [], recentRounds: [] }
        return {
          ...prev,
          session: buildHardSession(pick, lastIds),
          justMatchedId: null,
          justWrongIds: null,
          roundKey: prev.roundKey + 1,
          markedIrrelevantIds: [],
          recentRounds: newRecent,
        }
      }
      const picks = pickRound(deck, recentFlat)
      if (!picks) return { ...prev, session: null, markedIrrelevantIds: [], recentRounds: [] }
      return {
        ...prev,
        session: buildSession(picks, lastIds),
        justMatchedId: null,
        justWrongIds: null,
        roundKey: prev.roundKey + 1,
        markedIrrelevantIds: [],
        recentRounds: newRecent,
      }
    })
  }, [deck])

  const setDifficulty = useCallback((d: Difficulty) => {
    setState((prev) =>
      prev.difficulty === d
        ? prev
        : {
            ...prev,
            difficulty: d,
            session: null,
            score: 0,
            errors: 0,
            justMatchedId: null,
            justWrongIds: null,
            roundKey: 0,
            markedIrrelevantIds: [],
            recentRounds: [],
          },
    )
  }, [])

  /** 用户点击某张卡片 */
  const select = useCallback(
    (side: 'left' | 'right', cardId: string) => {
      setState((prev) => {
        if (!prev.session) return prev
        if (prev.justMatchedId || prev.justWrongIds) return prev
        const cards =
          side === 'left' ? prev.session.leftCards : prev.session.rightCards
        const card = cards.find((c) => c.id === cardId)
        if (!card) return prev
        if (prev.session.matchedPairIds.includes(card.pairId)) return prev
        // 标记为无关的卡片仍可选中，选中时自动解除标记（与单选一致）
        const unmarked = prev.markedIrrelevantIds.filter((id) => id !== cardId)

        const selectedLeft = side === 'left' ? cardId : prev.session.selectedLeft
        const selectedRight = side === 'right' ? cardId : prev.session.selectedRight

        if (!selectedLeft || !selectedRight) {
          return {
            ...prev,
            session: { ...prev.session, selectedLeft, selectedRight },
            markedIrrelevantIds: unmarked,
          }
        }

        const leftCard = prev.session.leftCards.find((c) => c.id === selectedLeft)
        const rightCard = prev.session.rightCards.find((c) => c.id === selectedRight)
        if (!leftCard || !rightCard) return prev

        if (leftCard.pairId === rightCard.pairId) {
          // 正确：组内叉乘命中
          queueResult(true)
          applyStats(
            leftCard.pairId,
            (cur) => ({
              lr: clamp(cur.lr - 0.5, 0, Number.POSITIVE_INFINITY),
              rl: clamp(cur.rl - 0.5, 0, Number.POSITIVE_INFINITY),
            }),
            true,
          )
          return {
            ...prev,
            session: {
              ...prev.session,
              matchedPairIds: [...prev.session.matchedPairIds, leftCard.pairId],
              selectedLeft,
              selectedRight,
            },
            score: prev.score + 1,
            justMatchedId: leftCard.pairId,
            markedIrrelevantIds: unmarked,
          }
        }

        // 错误：直接揭示正确配对（justMatchedId = 正确 pair），由动画结束后自动换题
        queueResult(false)
        applyStats(
          leftCard.pairId,
          (cur) => ({ lr: cur.lr + 1, rl: cur.rl + 1 }),
          false,
        )
        if (rightCard.pairId !== leftCard.pairId) {
          applyStats(
            rightCard.pairId,
            (cur) => ({ lr: cur.lr + 1, rl: cur.rl + 1 }),
            false,
          )
        }
        return {
          ...prev,
          session: { ...prev.session, selectedLeft, selectedRight },
          errors: prev.errors + 1,
          justMatchedId: rightCard.pairId,
          justWrongIds: null,
          markedIrrelevantIds: unmarked,
        }
      })
    },
    [applyStats, queueResult],
  )

  // 选对/揭示正确后 MATCH_HOLD_MS 进入下一回合
  useEffect(() => {
    if (!state.justMatchedId) return
    const t = setTimeout(() => {
      nextRound()
    }, MATCH_HOLD_MS)
    return () => clearTimeout(t)
  }, [state.justMatchedId, nextRound])

  const selectLeft = useCallback((id: string) => select('left', id), [select])
  const selectRight = useCallback((id: string) => select('right', id), [select])

  /** 长按标记/取消标记为无关（按卡片 id，仅当前回合有效） */
  const toggleIrrelevant = useCallback((cardId: string) => {
    setState((prev) => {
      if (!prev.session) return prev
      if (prev.justMatchedId || prev.justWrongIds) return prev
      const isLeft = prev.session.leftCards.some((c) => c.id === cardId)
      const card = (isLeft
        ? prev.session.leftCards
        : prev.session.rightCards
      ).find((c) => c.id === cardId)
      if (!card) return prev
      if (prev.session.matchedPairIds.includes(card.pairId)) return prev

      const exists = prev.markedIrrelevantIds.includes(cardId)
      const next = exists
        ? prev.markedIrrelevantIds.filter((id) => id !== cardId)
        : [...prev.markedIrrelevantIds, cardId]

      const clearSelectedLeft =
        !exists && isLeft && prev.session.selectedLeft === cardId
          ? null
          : prev.session.selectedLeft
      const clearSelectedRight =
        !exists && !isLeft && prev.session.selectedRight === cardId
          ? null
          : prev.session.selectedRight

      return {
        ...prev,
        markedIrrelevantIds: next,
        session: {
          ...prev.session,
          selectedLeft: clearSelectedLeft,
          selectedRight: clearSelectedRight,
        },
      }
    })
  }, [])

  const canPlayNormal = deck.length >= ROUND_SIZE
  const canPlayHard = deck.length >= HARD_TOTAL
  const canPlay = state.difficulty === 'hard' ? canPlayHard : canPlayNormal

  return {
    canPlay,
    canPlayNormal,
    canPlayHard,
    deck,
    difficulty: state.difficulty,
    session: state.session,
    score: state.score,
    errors: state.errors,
    justMatchedId: state.justMatchedId,
    justWrongIds: state.justWrongIds,
    roundKey: state.roundKey,
    markedIrrelevantIds: state.markedIrrelevantIds,
    start,
    nextRound,
    setDifficulty,
    selectLeft,
    selectRight,
    toggleIrrelevant,
  }
}
