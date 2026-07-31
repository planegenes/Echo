import { useCallback, useMemo, useState } from 'react'
import { useAtomValue } from 'jotai'
import type { FillBlankResult } from '@/types'
import { textsAtom, settingsAtom, type FillInputSession } from '@/store/atoms'
import { buildBlankPad, parseText } from '@/lib/parser'
import { isAiConfigured, judgeBlanks } from '@/lib/ai'
import type { AiJudgeRequest } from '@/types'

/**
 * 填空（输入）引擎（spec 5.5）
 * - 用户直接输入答案
 * - 确认后调用 AI 接口进行语义判断
 * - 接口配置保存在 settings，不上传服务器
 */
interface FillInputState {
  session: FillInputSession | null
  results: FillBlankResult[] | null
  loading: boolean
  error: string | null
}

export function useFillInputEngine(textId: string | null) {
  const texts = useAtomValue(textsAtom)
  const settings = useAtomValue(settingsAtom)

  const text = useMemo(
    () => texts.find((t) => t.id === textId) ?? null,
    [texts, textId],
  )

  const parsed = useMemo(
    () => (text ? parseText(text.content) : null),
    [text],
  )

  const blankPad = useMemo(() => {
    if (!parsed || parsed.maxBlankLength === 0) return ''
    return buildBlankPad(parsed.maxBlankLength)
  }, [parsed])

  const [state, setState] = useState<FillInputState>({
    session: null,
    results: null,
    loading: false,
    error: null,
  })

  const start = useCallback(() => {
    if (!text || !parsed) {
      setState({ session: null, results: null, loading: false, error: null })
      return
    }
    const inputs: Record<string, string> = {}
    for (const b of parsed.blanks) inputs[b.id] = ''
    setState({
      session: { textId: text.id, inputs, confirmed: false },
      results: null,
      loading: false,
      error: null,
    })
  }, [text, parsed])

  const setInput = useCallback((blankId: string, value: string) => {
    setState((prev) => {
      if (!prev.session || prev.session.confirmed) return prev
      return {
        ...prev,
        session: {
          ...prev.session,
          inputs: { ...prev.session.inputs, [blankId]: value },
        },
      }
    })
  }, [])

  const aiReady = isAiConfigured(settings)

  const confirm = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }))

    try {
      if (!text || !parsed || !state.session) {
        throw new Error('尚未初始化')
      }
      const blanks = parsed.blanks.map((b) => ({
        id: b.id,
        userAnswer: state.session!.inputs[b.id] ?? '',
        standardAnswer: b.answer,
      }))
      const req: AiJudgeRequest = { text: text.content, blanks }
      const resp = await judgeBlanks(settings, req)
      const results: FillBlankResult[] = resp.results.map((r) => {
        const original = blanks.find((b) => b.id === r.blankId)
        return {
          blankId: r.blankId,
          userAnswer: original?.userAnswer ?? '',
          // AI 返回 standardAnswer 优先；为空时 fallback 到本地解析的答案
          correctAnswer: r.standardAnswer || original?.standardAnswer || '',
          correct: r.correct,
          reason: r.reason,
        }
      })
      setState((prev) => ({
        ...prev,
        session: prev.session ? { ...prev.session, confirmed: true } : null,
        results,
        loading: false,
      }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setState((prev) => ({ ...prev, loading: false, error: msg }))
    }
  }, [text, parsed, state.session, settings])

  const reset = useCallback(() => start(), [start])

  const canPlay = !!(text && parsed && parsed.blanks.length > 0 && aiReady)

  return {
    canPlay,
    aiReady,
    text,
    parsed,
    blankPad,
    session: state.session,
    results: state.results,
    loading: state.loading,
    error: state.error,
    start,
    setInput,
    confirm,
    reset,
  }
}
