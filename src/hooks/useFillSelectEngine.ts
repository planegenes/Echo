import { useCallback, useMemo, useState } from 'react'
import { useAtomValue } from 'jotai'
import type { FillBlankResult, ParsedText, TextItem } from '@/types'
import { topicsAtom, findTextInTopics, type FillSelectSession } from '@/store/atoms'
import { buildBlankPad, collectAllBlankAnswers, parseText } from '@/lib/parser'
import { randInt, sampleN, shuffle, uid } from '@/lib/utils'

/**
 * 选词填空引擎（spec 5.4）
 * - 选项区：所有正确答案（去重）+ 10~15 个随机干扰项
 * - 干扰项优先来自其他文本的空白；不足时降低选项总数
 * - 拖拽 / 点击填入；点击已填入的空白槽可清空
 * - 确认后逐空比对，完全一致为正确
 */

interface FillSelectState {
  session: FillSelectSession | null
  results: FillBlankResult[] | null
  /** 当前选中的选项 id（点击填入模式） */
  selectedOptionId: string | null
}

const DISTRACTOR_MIN = 10
const DISTRACTOR_MAX = 15

interface PreparedOptions {
  options: { id: string; value: string; used: boolean }[]
  /** blankId -> 正确答案 */
  answerMap: Map<string, string>
}

function prepareOptions(
  parsed: ParsedText,
  allTexts: TextItem[],
): PreparedOptions {
  const { blanks } = parsed
  const answerMap = new Map<string, string>()
  // 所有正确答案（去重）
  const uniqueAnswers = new Map<string, string>() // value -> optionId
  for (const b of blanks) {
    answerMap.set(b.id, b.answer)
    if (!uniqueAnswers.has(b.answer)) {
      uniqueAnswers.set(b.answer, uid('opt'))
    }
  }

  // 干扰项：所有文本的空白答案（含当前文本），下一步会过滤掉与正确答案重复的
  const allAnswers = collectAllBlankAnswers(allTexts)
  // 排除与正确答案相同的项
  const distractorPool = allAnswers.filter((a) => !uniqueAnswers.has(a))

  // 选项总数：正确答案数 + 干扰项数（10~15），最少保证 2 个选项
  const totalDistractors = Math.min(
    distractorPool.length,
    randInt(DISTRACTOR_MIN, DISTRACTOR_MAX),
  )
  const distractors = sampleN(distractorPool, totalDistractors)

  const options = shuffle([
    ...Array.from(uniqueAnswers.entries()).map(([value, id]) => ({
      id,
      value,
      used: false,
    })),
    ...distractors.map((value) => ({
      id: uid('opt'),
      value,
      used: false,
    })),
  ])

  return { options, answerMap }
}

export function useFillSelectEngine(textId: string | null) {
  const topics = useAtomValue(topicsAtom)

  const { text, topicTexts } = useMemo(() => {
    if (!textId) return { text: null, topicTexts: [] as TextItem[] }
    const found = findTextInTopics(topics, textId)
    return found
      ? { text: found.text, topicTexts: found.topic.texts }
      : { text: null, topicTexts: [] as TextItem[] }
  }, [topics, textId])

  const parsed = useMemo(
    () => (text ? parseText(text.content) : null),
    [text],
  )

  /** 每个空白槽的全角空格填充宽度（首次确定后保持稳定） */
  const blankPad = useMemo(() => {
    if (!parsed || parsed.maxBlankLength === 0) return ''
    return buildBlankPad(parsed.maxBlankLength)
  }, [parsed])

  const [state, setState] = useState<FillSelectState>({
    session: null,
    results: null,
    selectedOptionId: null,
  })

  const start = useCallback(() => {
    if (!text || !parsed) {
      setState({ session: null, results: null, selectedOptionId: null })
      return
    }
    const { options, answerMap } = prepareOptions(parsed, topicTexts)
    const filled: Record<string, string | null> = {}
    for (const b of parsed.blanks) filled[b.id] = null
    // answerMap 不直接进 session（避免冗余），通过闭包持有
    answerMapRef.current = answerMap
    setState({
      session: {
        textId: text.id,
        options,
        filled,
        confirmed: false,
      },
      results: null,
      selectedOptionId: null,
    })
  }, [text, parsed, topicTexts])

  const answerMapRef = useState<{ current: Map<string, string> | null }>(
    () => ({ current: null }),
  )[0]

  /** 选中某个选项（点击填入模式） */
  const selectOption = useCallback((optionId: string | null) => {
    setState((prev) => {
      if (!prev.session || prev.session.confirmed) return prev
      return { ...prev, selectedOptionId: optionId }
    })
  }, [])

  /** 把选项填入空白槽 */
  const fillBlank = useCallback((blankId: string, optionId: string | null) => {
    setState((prev) => {
      if (!prev.session || prev.session.confirmed) return prev
      const options = prev.session.options.map((o) => ({ ...o }))
      const filled = { ...prev.session.filled }

      // 若 blankId 已有旧选项，先释放
      const prevOpt = filled[blankId]
      if (prevOpt) {
        const o = options.find((x) => x.id === prevOpt)
        if (o) o.used = false
      }
      // 填入新选项
      if (optionId) {
        const o = options.find((x) => x.id === optionId)
        if (!o || o.used) {
          // 已被使用 → 不允许
          return { ...prev, selectedOptionId: null }
        }
        o.used = true
        filled[blankId] = optionId
      } else {
        filled[blankId] = null
      }
      return {
        ...prev,
        session: { ...prev.session, options, filled },
        selectedOptionId: null,
      }
    })
  }, [])

  /** 清空某空白槽（点击已填入的空白槽时调用） */
  const clearBlank = useCallback(
    (blankId: string) => fillBlank(blankId, null),
    [fillBlank],
  )

  /** 确认提交，逐空比对 */
  const confirm = useCallback(() => {
    setState((prev) => {
      if (!prev.session || prev.session.confirmed) return prev
      const answerMap = answerMapRef.current
      if (!answerMap) return prev
      const results: FillBlankResult[] = []
      for (const [blankId, optId] of Object.entries(prev.session.filled)) {
        const standard = answerMap.get(blankId) ?? ''
        const userAnswer = optId
          ? prev.session.options.find((o) => o.id === optId)?.value ?? ''
          : ''
        results.push({
          blankId,
          userAnswer,
          correctAnswer: standard,
          correct: userAnswer === standard,
        })
      }
      return {
        ...prev,
        session: { ...prev.session, confirmed: true },
        results,
      }
    })
  }, [])

  const reset = useCallback(() => start(), [start])

  const canPlay = !!(text && parsed && parsed.blanks.length > 0)

  return {
    canPlay,
    text,
    parsed,
    blankPad,
    session: state.session,
    results: state.results,
    selectedOptionId: state.selectedOptionId,
    start,
    selectOption,
    fillBlank,
    clearBlank,
    confirm,
    reset,
  }
}
