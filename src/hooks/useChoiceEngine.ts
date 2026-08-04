import { useCallback, useState } from 'react'
import { useAtomValue } from 'jotai'
import type { Content, ContentFormat, PairItem } from '@/types'
import { activeDeckAtom, persistPair, type ChoiceSession } from '@/store/atoms'
import { clamp, randInt, sampleN, shuffle, uid } from '@/lib/utils'
import type { ChoiceDirection } from '@/types'

/**
 * 模式二：单选匹配（spec 5.2）
 * - 上方随机显示 pair 的 left 或 right
 * - 下方选项全部来自另一边
 * - 选项总数 6~10 随机，不超过题库大小
 * - askLeft 时用 lr 抽题，否则 rl
 * - 错误：对应方向 +1；正确：对应方向 -0.5（最低 0）
 * - 干扰项从其他 pair 的对边抽取，避免与正确答案重复
 */

interface ChoiceOption {
  id: string
  value: string
  format: ContentFormat
}

interface ChoiceEngineState {
  session: ChoiceSession | null
  score: number
  errors: number
  /** 本题被长按标记为无关的 option id 列表（下题自动清空） */
  markedIrrelevantIds: string[]
  /** 最近 3 题出现过的 pair id（用于间隔控制） */
  recentPairIds: string[]
}

const MIN_DECK = 2

function pickQuestion(
  deck: PairItem[],
  recentPairIds: string[],
): {
  pair: PairItem
  direction: ChoiceDirection
  prompt: Content
  answer: Content
  options: ChoiceOption[]
} | null {
  if (deck.length < MIN_DECK) return null

  // 排除最近 3 题出现过的 pair（间隔 ≥ 3）
  const available = deck.filter((p) => !recentPairIds.includes(p.id))
  const pool = available.length >= MIN_DECK ? available : deck

  const direction: ChoiceDirection = Math.random() < 0.5 ? 'askLeft' : 'askRight'
  const weights = pool.map((p) => {
    const stat = direction === 'askLeft' ? p.stats?.lr ?? 0 : p.stats?.rl ?? 0
    return 1 + stat
  })

  // 加权抽 1 个 pair
  const [pair] = weightedSampleN(pool, weights, 1)
  if (!pair) return null

  const prompt = direction === 'askLeft' ? pair.left : pair.right
  const answer = direction === 'askLeft' ? pair.right : pair.left

  // 干扰项：其他 pair 的对边
  const distractorPool = deck
    .filter((p) => p.id !== pair.id)
    .map((p) => (direction === 'askLeft' ? p.right : p.left))

  // 按 value 去重，并排除与正确答案相同的项
  const dedup = new Map<string, Content>()
  for (const c of distractorPool) {
    if (c.value === answer.value) continue
    if (!dedup.has(c.value)) dedup.set(c.value, c)
  }
  const uniqueDistractors = Array.from(dedup.values())

  // 选项总数：6~10，但不超过题库大小；最少 2
  const total = Math.max(2, Math.min(randInt(6, 10), deck.length))
  const numDistractors = Math.min(uniqueDistractors.length, total - 1)
  const distractors = sampleN(uniqueDistractors, numDistractors)

  const options: ChoiceOption[] = shuffle([
    { id: uid('opt'), value: answer.value, format: answer.format },
    ...distractors.map((c) => ({
      id: uid('opt'),
      value: c.value,
      format: c.format,
    })),
  ])

  return { pair, direction, prompt, answer, options }
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

  const [state, setState] = useState<ChoiceEngineState>({
    session: null,
    score: 0,
    errors: 0,
    markedIrrelevantIds: [],
    recentPairIds: [],
  })

  const applyStats = useCallback(
    (
      pairId: string,
      direction: ChoiceDirection,
      patch: (cur: number) => number,
    ) => {
      const pair = deck.find((p) => p.id === pairId)
      if (!pair) return
      const key = direction === 'askLeft' ? 'lr' : 'rl'
      const cur = pair.stats?.[key] ?? 0
      const next = patch(cur)
      const stats = { ...pair.stats, [key]: next } as PairItem['stats']
      void persistPair({ ...pair, stats })
    },
    [deck],
  )

  const next = useCallback(() => {
    setState((prev) => {
      // 更新最近 3 题的 pair id 记录
      const currentPairId = prev.session?.pair.id
      const recent = currentPairId
        ? [...prev.recentPairIds, currentPairId].slice(-3)
        : prev.recentPairIds

      const q = pickQuestion(deck, recent)
      if (!q) {
        return { ...prev, session: null, markedIrrelevantIds: [], recentPairIds: recent }
      }
      return {
        ...prev,
        session: {
          pair: q.pair,
          direction: q.direction,
          prompt: { format: q.prompt.format, value: q.prompt.value },
          answerValue: q.answer.value,
          options: q.options,
          selectedId: null,
          resolved: 'idle',
        },
        markedIrrelevantIds: [],
        recentPairIds: recent,
      }
    })
  }, [deck])

  const start = useCallback(() => {
    setState({ session: null, score: 0, errors: 0, markedIrrelevantIds: [], recentPairIds: [] })
    next()
  }, [next])

  const selectOption = useCallback(
    (optionId: string) => {
      setState((prev) => {
        if (!prev.session || prev.session.resolved !== 'idle') return prev
        // 已标记为无关的不再可选（保险，正常已被 ChoiceOption 拦截）
        if (prev.markedIrrelevantIds.includes(optionId)) return prev
        const option = prev.session.options.find((o) => o.id === optionId)
        if (!option) return prev
        const correct = option.value === prev.session.answerValue
        const direction = prev.session.direction
        // 更新 stats
        applyStats(
          prev.session.pair.id,
          direction,
          (cur) =>
            correct
              ? clamp(cur - 0.5, 0, Number.POSITIVE_INFINITY)
              : cur + 1,
        )
        return {
          ...prev,
          session: {
            ...prev.session,
            selectedId: optionId,
            resolved: correct ? 'correct' : 'wrong',
          },
          score: correct ? prev.score + 1 : prev.score,
          errors: correct ? prev.errors : prev.errors + 1,
        }
      })
    },
    [applyStats],
  )

  /** 长按标记/取消标记为无关选项（仅当前题有效） */
  const toggleIrrelevant = useCallback((optionId: string) => {
    setState((prev) => {
      if (!prev.session || prev.session.resolved !== 'idle') return prev
      const exists = prev.markedIrrelevantIds.includes(optionId)
      const nextIds = exists
        ? prev.markedIrrelevantIds.filter((id) => id !== optionId)
        : [...prev.markedIrrelevantIds, optionId]
      return {
        ...prev,
        markedIrrelevantIds: nextIds,
        // 取消标记时不清除 selectedId（选项未被选中过）；
        // 标记时如果该项被选中，清除选中
        session:
          !exists && prev.session.selectedId === optionId
            ? { ...prev.session, selectedId: null }
            : prev.session,
      }
    })
  }, [])

  const canPlay = deck.length >= MIN_DECK

  return {
    canPlay,
    deck,
    session: state.session,
    score: state.score,
    errors: state.errors,
    markedIrrelevantIds: state.markedIrrelevantIds,
    start,
    next,
    selectOption,
    toggleIrrelevant,
  }
}
