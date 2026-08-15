import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAtomValue } from 'jotai'
import { usePointsRecorder } from '@/hooks/usePoints'
import type { TranslateResult, TranslateSession } from '@/types'
import { topicsAtom, settingsAtom, findSentenceInTopics } from '@/store/atoms'
import { isAiConfigured } from '@/lib/ai'
import { compareIgnorePunctuation } from '@/lib/sentence'
import { judgeTranslation } from '@/lib/sentence-ai'

interface TranslateState {
  session: TranslateSession | null
  result: TranslateResult | null
  loading: boolean
  error: string | null
}

/**
 * 翻译题引擎
 * - 字面比对（忽略标点）一致则通过
 * - 不一致则调用 AI 语义判断
 */
export function useSentenceTranslateEngine(sentenceId: string | null) {
  const topics = useAtomValue(topicsAtom)
  const settings = useAtomValue(settingsAtom)
  const { queueResult } = usePointsRecorder()

  const sentence = useMemo(() => {
    if (!sentenceId) return null
    return findSentenceInTopics(topics, sentenceId)?.sentence ?? null
  }, [topics, sentenceId])

  const [state, setState] = useState<TranslateState>({
    session: null,
    result: null,
    loading: false,
    error: null,
  })

  useEffect(() => {
    setState({ session: null, result: null, loading: false, error: null })
  }, [sentenceId])

  const aiReady = isAiConfigured(settings)

  const start = useCallback(() => {
    if (!sentence) {
      setState({ session: null, result: null, loading: false, error: null })
      return
    }
    setState({
      session: { sentenceId: sentence.id, input: '', confirmed: false },
      result: null,
      loading: false,
      error: null,
    })
  }, [sentence])

  const setInput = useCallback((value: string) => {
    setState((prev) => {
      if (!prev.session || prev.session.confirmed) return prev
      return { ...prev, session: { ...prev.session, input: value } }
    })
  }, [])

  const confirm = useCallback(async () => {
    if (!sentence || !state.session) return
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const userAnswer = state.session.input
      const exactMatch = compareIgnorePunctuation(userAnswer, sentence.answer)
      let result: TranslateResult
      if (exactMatch) {
        result = { correct: true, exactMatch: true }
      } else if (aiReady) {
        const ai = await judgeTranslation(
          settings,
          sentence.answer,
          userAnswer,
          sentence.hint,
          { modelOverride: sentence.aiModel },
        )
        result = { correct: ai.correct, exactMatch: false, reason: ai.reason }
      } else {
        // 未配置 AI：仅字面比对
        result = { correct: false, exactMatch: false }
      }
      queueResult(result.correct)
      setState((prev) => ({
        ...prev,
        session: prev.session
          ? { ...prev.session, confirmed: true }
          : null,
        result,
        loading: false,
      }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setState((prev) => ({ ...prev, loading: false, error: msg }))
    }
  }, [sentence, state.session, aiReady, settings, queueResult])

  const reset = useCallback(() => start(), [start])

  const canPlay = !!(sentence && aiReady)

  return {
    canPlay,
    aiReady,
    sentence,
    session: state.session,
    result: state.result,
    loading: state.loading,
    error: state.error,
    start,
    setInput,
    confirm,
    reset,
  }
}
