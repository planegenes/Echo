import { useCallback, useEffect, useState } from 'react'
import { useAtomValue } from 'jotai'
import type { PairItem } from '@/types'
import { activeDeckAtom, persistPair, type MatchSession } from '@/store/atoms'
import { clamp, sampleN, shuffle } from '@/lib/utils'

/**
 * 模式一：左右配对（spec 5.1，重做版）
 * - 普通难度：每回合 4 组 pair，左右分别打乱
 * - 困难难度：1 组正确 + 4 组仅左侧 + 4 组仅右侧 = 9 组，5+5 选项中只有一对正确答案
 * - 选中 left + right 后判定
 * - 正确：那一对变绿，其他选项淡出；0.6s 后自动开新一回合（避开上一轮的 pair）
 * - 错误：选中两项变红，0.8s 后清除可继续选
 * - 抽取权重：1 + lr + rl，避开上一轮的 pair
 */
const ROUND_SIZE = 4
const MATCH_HOLD_MS = 600
const WRONG_HOLD_MS = 800

/** 困难模式：1 正确 + 4 左干扰 + 4 右干扰 = 9 组，每侧 5 选项 */
const HARD_TOTAL = 9

export type Difficulty = 'normal' | 'hard'

interface MatchEngineState {
  session: MatchSession | null
  score: number
  errors: number
  /** 刚选对的 pair id，用于触发"变绿淡出其他"动画 */
  justMatchedId: string | null
  /** 刚选错的两侧 pair id，用于触发"变红"动画 */
  justWrongIds: { left: string; right: string } | null
  /** 每开新回合自增，用作 grid key 以触发载入动画 */
  roundKey: number
  /** 当前难度 */
  difficulty: Difficulty
  /** 本回合被长按标记为无关的卡片标识列表（格式 `${pairId}:${side}`，左右独立，下回合自动清空） */
  markedIrrelevantIds: string[]
  /** 最近 3 回合出现过的 pair id（每回合为数组，用于间隔控制） */
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
  // 排除最近 3 回合出现过的 pair（间隔 ≥ 3）
  const available = deck.filter((p) => !recentPairIds.includes(p.id))
  const pool = available.length >= ROUND_SIZE ? available : deck
  const weights = pool.map((p) => 1 + (p.stats?.lr ?? 0) + (p.stats?.rl ?? 0))
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

function buildSession(pairs: PairItem[], lastPairIds: string[]): MatchSession {
  return {
    pairs,
    leftOrder: shuffle(pairs.map((p) => p.id)),
    rightOrder: shuffle(pairs.map((p) => p.id)),
    selectedLeft: null,
    selectedRight: null,
    matchedIds: [],
    lastPairIds,
  }
}

/** 困难模式抽取：1 正确 + 4 左干扰 + 4 右干扰，共 9 组互不相同的 pair */
function pickRoundHard(
  deck: PairItem[],
  recentPairIds: string[],
): HardPick | null {
  if (deck.length < HARD_TOTAL) return null
  // 排除最近 3 回合出现过的 pair（间隔 ≥ 3）
  const available = deck.filter((p) => !recentPairIds.includes(p.id))
  const pool = available.length >= HARD_TOTAL ? available : deck
  const weights = pool.map((p) => 1 + (p.stats?.lr ?? 0) + (p.stats?.rl ?? 0))
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
  const allPairs = [pick.correct, ...pick.leftDistractors, ...pick.rightDistractors]
  // 左侧：正确 pair 的 left + 4 个左干扰的 left
  // 右侧：正确 pair 的 right + 4 个右干扰的 right
  // 只有 correct.id 同时出现在 leftOrder 和 rightOrder 中 → 唯一正确答案
  const leftIds = [pick.correct.id, ...pick.leftDistractors.map((p) => p.id)]
  const rightIds = [pick.correct.id, ...pick.rightDistractors.map((p) => p.id)]
  return {
    pairs: allPairs,
    leftOrder: shuffle(leftIds),
    rightOrder: shuffle(rightIds),
    selectedLeft: null,
    selectedRight: null,
    matchedIds: [],
    lastPairIds,
  }
}

export function useMatchEngine() {
  const deck = useAtomValue(activeDeckAtom)

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

  /** 同步更新 pair 的 stats 并写回 atom + IndexedDB */
  const applyStats = useCallback(
    (pairId: string, patch: (cur: { lr: number; rl: number }) => { lr: number; rl: number }) => {
      const pair = deck.find((p) => p.id === pairId)
      if (!pair) return
      const cur = { lr: pair.stats?.lr ?? 0, rl: pair.stats?.rl ?? 0 }
      const next = patch(cur)
      void persistPair({ ...pair, stats: next })
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
      // 更新最近 3 回合的 pair id 记录
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

  /** 切换难度并重置当前会话 */
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
    (side: 'left' | 'right', pairId: string) => {
      setState((prev) => {
        if (!prev.session) return prev
        // 动画期间锁定点击
        if (prev.justMatchedId || prev.justWrongIds) return prev
        // 已匹配过的不能再选
        if (prev.session.matchedIds.includes(pairId)) return prev
        // 已标记为无关的不再可选（保险，正常已被 MatchCard 拦截）
        if (prev.markedIrrelevantIds.includes(`${pairId}:${side}`)) return prev

        const selectedLeft = side === 'left' ? pairId : prev.session.selectedLeft
        const selectedRight = side === 'right' ? pairId : prev.session.selectedRight

        // 单侧选中：等用户选另一侧
        if (!selectedLeft || !selectedRight) {
          return {
            ...prev,
            session: { ...prev.session, selectedLeft, selectedRight },
          }
        }

        // 两侧都已选中 → 判定
        if (selectedLeft === selectedRight) {
          // 正确：lr/rl 各 -0.5（最低 0）
          applyStats(selectedLeft, (cur) => ({
            lr: clamp(cur.lr - 0.5, 0, Number.POSITIVE_INFINITY),
            rl: clamp(cur.rl - 0.5, 0, Number.POSITIVE_INFINITY),
          }))
          return {
            ...prev,
            session: {
              ...prev.session,
              matchedIds: [...prev.session.matchedIds, selectedLeft],
              selectedLeft,
              selectedRight,
            },
            score: prev.score + 1,
            justMatchedId: selectedLeft,
          }
        }

        // 错误：两侧 pair 的 lr/rl 都 +1
        applyStats(selectedLeft, (cur) => ({
          lr: cur.lr + 1,
          rl: cur.rl + 1,
        }))
        if (selectedRight !== selectedLeft) {
          applyStats(selectedRight, (cur) => ({
            lr: cur.lr + 1,
            rl: cur.rl + 1,
          }))
        }

        return {
          ...prev,
          session: {
            ...prev.session,
            selectedLeft,
            selectedRight,
          },
          errors: prev.errors + 1,
          justWrongIds: { left: selectedLeft, right: selectedRight },
        }
      })
    },
    [applyStats],
  )

  // 选对后 MATCH_HOLD_MS 进入下一回合
  useEffect(() => {
    if (!state.justMatchedId) return
    const t = setTimeout(() => {
      nextRound()
    }, MATCH_HOLD_MS)
    return () => clearTimeout(t)
  }, [state.justMatchedId, nextRound])

  // 选错后 WRONG_HOLD_MS 清除错误状态与选中
  useEffect(() => {
    if (!state.justWrongIds) return
    const t = setTimeout(() => {
      setState((prev) => ({
        ...prev,
        justWrongIds: null,
        session: prev.session
          ? {
              ...prev.session,
              selectedLeft: null,
              selectedRight: null,
            }
          : null,
      }))
    }, WRONG_HOLD_MS)
    return () => clearTimeout(t)
  }, [state.justWrongIds])

  const selectLeft = useCallback((id: string) => select('left', id), [select])
  const selectRight = useCallback((id: string) => select('right', id), [select])

  /** 长按标记/取消标记为无关选项（按 side 粒度，仅当前回合有效） */
  const toggleIrrelevant = useCallback((pairId: string, side: 'left' | 'right') => {
    const key = `${pairId}:${side}`
    setState((prev) => {
      if (!prev.session) return prev
      // 动画期间锁定操作
      if (prev.justMatchedId || prev.justWrongIds) return prev
      // 已匹配过的不能标记
      if (prev.session.matchedIds.includes(pairId)) return prev
      const exists = prev.markedIrrelevantIds.includes(key)
      const next = exists
        ? prev.markedIrrelevantIds.filter((id) => id !== key)
        : [...prev.markedIrrelevantIds, key]
      // 标记时清除该项当前侧的 selected 状态（避免遗留选中）
      const isLeft = side === 'left'
      const clearSelectedLeft =
        !exists && isLeft && prev.session.selectedLeft === pairId
          ? null
          : prev.session.selectedLeft
      const clearSelectedRight =
        !exists && !isLeft && prev.session.selectedRight === pairId
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
