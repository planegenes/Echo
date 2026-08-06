import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAtomValue } from 'jotai'
import type { AssemblyOption, AssemblySession } from '@/types'
import { topicsAtom, findSentenceInTopics } from '@/store/atoms'
import { compareIgnorePunctuation } from '@/lib/sentence'
import { randInt, sampleN, shuffle, uid } from '@/lib/utils'

interface AssemblyState {
  session: AssemblySession | null
  result: { correct: boolean } | null
}

/**
 * 组句题引擎
 * - 以选中题目的 words 作为正确项
 * - 从同专题其它题目中抽取 4-8 个单词作为干扰项
 * - 作答区可拖入、拖序、拖回候选区
 * - 判题：拼接作答区单词，忽略标点比对标准答案
 */
export function useSentenceAssemblyEngine(sentenceId: string | null) {
  const topics = useAtomValue(topicsAtom)

  const found = useMemo(() => {
    if (!sentenceId) return null
    return findSentenceInTopics(topics, sentenceId)
  }, [topics, sentenceId])

  const sentence = found?.sentence ?? null
  const topic = found?.topic ?? null

  const [state, setState] = useState<AssemblyState>({
    session: null,
    result: null,
  })

  // 切换题目时重置会话
  useEffect(() => {
    setState({ session: null, result: null })
  }, [sentenceId])

  /** 构建选项池：正确单词 + 4-8 个干扰项 */
  const buildOptions = useCallback((): AssemblyOption[] => {
    if (!sentence || !topic) return []
    const correctSet = new Set(sentence.words)
    // 同专题其它题目的单词作为干扰项池（去重，排除与正确项相同者）
    const pool: string[] = []
    for (const s of topic.sentences) {
      if (s.id === sentence.id) continue
      for (const w of s.words) {
        if (!correctSet.has(w) && !pool.includes(w)) pool.push(w)
      }
    }
    const distractorCount = Math.min(pool.length, randInt(4, 8))
    const distractors = sampleN(pool, distractorCount)

    const correctOpts: AssemblyOption[] = sentence.words.map((w) => ({
      id: uid('opt'),
      value: w,
      used: false,
    }))
    const distractorOpts: AssemblyOption[] = distractors.map((w) => ({
      id: uid('opt'),
      value: w,
      used: false,
    }))
    return shuffle([...correctOpts, ...distractorOpts])
  }, [sentence, topic])

  const start = useCallback(() => {
    if (!sentence) {
      setState({ session: null, result: null })
      return
    }
    const options = buildOptions()
    setState({
      session: {
        sentenceId: sentence.id,
        options,
        placed: [],
        confirmed: false,
      },
      result: null,
    })
  }, [sentence, buildOptions])

  const markUsed = (options: AssemblyOption[], id: string, used: boolean) =>
    options.map((o) => (o.id === id ? { ...o, used } : o))

  const placeOption = useCallback((optionId: string) => {
    setState((prev) => {
      if (!prev.session || prev.session.confirmed) return prev
      const opt = prev.session.options.find((o) => o.id === optionId)
      if (!opt || opt.used) return prev
      return {
        ...prev,
        session: {
          ...prev.session,
          options: markUsed(prev.session.options, optionId, true),
          placed: [...prev.session.placed, optionId],
        },
      }
    })
  }, [])

  const insertOption = useCallback((optionId: string, index: number) => {
    setState((prev) => {
      if (!prev.session || prev.session.confirmed) return prev
      const opt = prev.session.options.find((o) => o.id === optionId)
      if (!opt || opt.used) return prev
      const nextPlaced = [...prev.session.placed]
      const clamped = Math.max(0, Math.min(nextPlaced.length, index))
      nextPlaced.splice(clamped, 0, optionId)
      return {
        ...prev,
        session: {
          ...prev.session,
          options: markUsed(prev.session.options, optionId, true),
          placed: nextPlaced,
        },
      }
    })
  }, [])

  const removeAt = useCallback((index: number) => {
    setState((prev) => {
      if (!prev.session || prev.session.confirmed) return prev
      const optionId = prev.session.placed[index]
      if (!optionId) return prev
      return {
        ...prev,
        session: {
          ...prev.session,
          options: markUsed(prev.session.options, optionId, false),
          placed: prev.session.placed.filter((_, i) => i !== index),
        },
      }
    })
  }, [])

  const reorder = useCallback((from: number, to: number) => {
    setState((prev) => {
      if (!prev.session || prev.session.confirmed) return prev
      const next = [...prev.session.placed]
      if (from < 0 || from >= next.length || to < 0 || to >= next.length) {
        return prev
      }
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return { ...prev, session: { ...prev.session, placed: next } }
    })
  }, [])

  const confirm = useCallback(() => {
    setState((prev) => {
      if (!prev.session || !sentence) return prev
      const composed = prev.session.placed
        .map((id) => prev.session!.options.find((o) => o.id === id)?.value ?? '')
        .join('')
      const correct = compareIgnorePunctuation(composed, sentence.answer)
      return {
        session: { ...prev.session, confirmed: true },
        result: { correct },
      }
    })
  }, [sentence])

  const reset = useCallback(() => start(), [start])

  const canPlay = !!(sentence && sentence.words.length > 0)

  return {
    canPlay,
    sentence,
    session: state.session,
    result: state.result,
    start,
    placeOption,
    insertOption,
    removeAt,
    reorder,
    confirm,
    reset,
  }
}
