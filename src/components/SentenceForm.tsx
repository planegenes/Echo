import { useEffect, useMemo, useRef, useState } from 'react'
import type { SentenceItem } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModelSelector } from '@/components/ModelSelector'
import { useSettingsValue } from '@/store/atoms'
import { isAiConfigured } from '@/lib/ai'
import { segmentSentence } from '@/lib/sentence-ai'
import { splitSentence, toUnits, isPunctOrSpace } from '@/lib/sentence'
import { ContentRenderer } from '@/components/ContentRenderer'
import { uid } from '@/lib/utils'
import { Loader2, Sparkles, Scissors, X } from 'lucide-react'

export interface SentenceFormProps {
  initial?: SentenceItem | null
  onSubmit: (sentence: SentenceItem) => void | Promise<void>
  onCancel: () => void
}

/**
 * 由已有分词 words 推导切分线间隙标记（编辑题目时回显到分词区）
 * 按单元顺序匹配 words，word 边界处生成间隙标记；标点单元自动切分、无需标记
 */
function marksFromWords(answer: string, words: string[]): Set<number> {
  const marks = new Set<number>()
  if (words.length === 0) return marks
  const units = toUnits(answer)
  let wordIdx = 0
  let wordRest = words[0]
  for (let i = 0; i < units.length; i++) {
    const u = units[i]
    // 标点/空白：words 中不包含，跳过（不消耗 wordRest）
    if (u.length === 1 && isPunctOrSpace(u)) continue
    if (wordRest === '') {
      // 上一个 word 已消耗完，遇到新的非标点单元 → 下一个 word 开头，此处为切分点
      wordIdx++
      if (wordIdx >= words.length) break
      wordRest = words[wordIdx]
      marks.add(i)
    }
    if (wordRest.startsWith(u)) {
      wordRest = wordRest.slice(u.length)
    } else {
      break // 数据不一致，停止推导
    }
  }
  return marks
}

/**
 * 组句题目编辑表单
 * - 上方输入框：标准答案
 * - 中间输入框：提示
 * - 下方字符区：将答案按字符等宽（1 全角字宽）排开，
 *   光标在区域内时根据光标位置在字符间显示竖线，点击标记固定竖线，
 *   确认后按竖线与标点分词；另提供 AI 分词选项
 */
export function SentenceForm({ initial, onSubmit, onCancel }: SentenceFormProps) {
  const settings = useSettingsValue()
  const [answer, setAnswer] = useState(initial?.answer ?? '')
  const [hint, setHint] = useState(initial?.hint ?? '')
  const [aiModel, setAiModel] = useState<string>(initial?.aiModel ?? '')
  const [marks, setMarks] = useState<Set<number>>(new Set())
  const [hoverGap, setHoverGap] = useState<number | null>(null)
  const [words, setWords] = useState<string[]>(initial?.words ?? [])
  const [segmenting, setSegmenting] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const rowRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setAnswer(initial?.answer ?? '')
    setHint(initial?.hint ?? '')
    setAiModel(initial?.aiModel ?? '')
    setWords(initial?.words ?? [])
    // 编辑已有题目时，把当前分词回显到分词区（切分线标记）
    setMarks(
      initial && initial.words.length > 0
        ? marksFromWords(initial.answer, initial.words)
        : new Set(),
    )
    setAiError(null)
  }, [initial])

  const units = useMemo(() => toUnits(answer), [answer])
  const N = units.length

  const aiReady = isAiConfigured(settings)

  /** 用户编辑答案时，清除已分词结果与标记（位置已失效） */
  const handleAnswerChange = (value: string) => {
    setAnswer(value)
    setWords([])
    setMarks(new Set())
    setAiError(null)
  }

  /** 根据鼠标位置计算最近的间隙索引 (0..N)，按各单元实际位置判定 */
  const computeGap = (clientX: number): number => {
    const row = rowRef.current
    if (!row || N === 0) return 0
    const spans = row.querySelectorAll<HTMLElement>('[data-unit]')
    for (let i = 0; i < spans.length; i++) {
      const rect = spans[i].getBoundingClientRect()
      // 以该单元中点分界：落在左侧归前一个间隙
      if (clientX < rect.left + rect.width / 2) return i
    }
    return N
  }

  const onMouseMove = (e: React.MouseEvent) => {
    if (N === 0) return
    setHoverGap(computeGap(e.clientX))
  }

  const onMouseLeave = () => setHoverGap(null)

  const onClickArea = (e: React.MouseEvent) => {
    if (N === 0) return
    const gap = computeGap(e.clientX)
    // 行首/行尾的间隙（0 / N）对分词无意义，忽略
    if (gap <= 0 || gap >= N) return
    setMarks((prev) => {
      const next = new Set(prev)
      if (next.has(gap)) next.delete(gap)
      else next.add(gap)
      return next
    })
  }

  const handleConfirmSplit = () => {
    setWords(splitSentence(answer, [...marks]))
    setAiError(null)
  }

  const handleAiSegment = async () => {
    if (!answer.trim()) return
    setSegmenting(true)
    setAiError(null)
    try {
      const result = await segmentSentence(settings, answer, {
        modelOverride: aiModel || undefined,
      })
      setWords(result)
      // AI 分词后清空手动标记，避免与结果混淆
      setMarks(new Set())
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err))
    } finally {
      setSegmenting(false)
    }
  }

  const canSubmit = answer.trim().length > 0 && !submitting

  const handleSubmit = async () => {
    if (!canSubmit) return
    // 若未分词，则按当前标记与标点兜底分词
    const finalWords =
      words.length > 0 ? words : splitSentence(answer, [...marks])
    setSubmitting(true)
    try {
      await onSubmit({
        id: initial?.id ?? uid('sentence'),
        answer: answer.trim(),
        hint: hint.trim(),
        words: finalWords,
        aiModel: aiModel || undefined,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* 上方：标准答案 */}
      <div className="space-y-2">
        <Label>标准答案</Label>
        <Input
          value={answer}
          onChange={(e) => handleAnswerChange(e.target.value)}
          placeholder="输入作为标准答案的句子"
          autoFocus
        />
      </div>

      {/* 中间：提示 */}
      <div className="space-y-2">
        <Label>提示</Label>
        <Input
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          placeholder="给作答者的提示文本（可空）"
        />
      </div>

      {/* AI 模型覆盖（可选） */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">
          AI 模型覆盖（用于分词与翻译判题）
        </Label>
        <ModelSelector
          value={aiModel}
          onChange={setAiModel}
          providers={settings.aiProviders}
          allowEmpty
          emptyLabel="使用默认模型"
        />
      </div>

      {/* 下方：字符级分词区 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>分词区</Label>
          <span className="text-xs text-muted-foreground">
            点击字符间隙添加/移除切分线
          </span>
        </div>

        <div
          className="relative min-h-[3.5rem] select-none rounded-md border bg-muted/20 p-2 font-mono leading-relaxed"
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
          onClick={onClickArea}
          style={{ fontSize: '1.5rem', cursor: N > 0 ? 'text' : 'default' }}
        >
          {N === 0 ? (
            <div className="text-sm text-muted-foreground" style={{ fontSize: '0.875rem' }}>
              在上方输入答案后，字符将在此按等宽排开，便于标记分词位置。
            </div>
          ) : (
            <div ref={rowRef} className="inline-flex flex-wrap gap-x-[6px]">
              {units.map((u, i) => (
                <span
                  key={i}
                  data-unit
                  className="relative inline-block text-center"
                  style={{ minWidth: '1em' }}
                >
                  {u === ' ' ? (
                    <span className="text-muted-foreground/50">·</span>
                  ) : (
                    <ContentRenderer
                      content={{
                        format: u.includes('^') ? 'ruby' : 'text',
                        value: u,
                      }}
                    />
                  )}
                  {/* 切分线：粗 3px，落在间隔正中（间隔 6px，竖线左移 1.5px 后中心与间隔中心对齐） */}
                  {marks.has(i + 1) ? (
                    <span className="absolute left-[calc(100%+1.5px)] top-0 bottom-0 w-[3px] bg-primary" />
                  ) : hoverGap === i + 1 && i + 1 < N ? (
                    <span className="absolute left-[calc(100%+1.5px)] top-1 bottom-1 w-[3px] border-l-[3px] border-dashed border-primary/60" />
                  ) : null}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleConfirmSplit}
            disabled={N === 0}
          >
            <Scissors className="h-4 w-4" />
            确认分词
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAiSegment}
            disabled={!aiReady || N === 0 || segmenting}
            title={!aiReady ? '需先配置 AI 接口' : '使用 AI 自动分词'}
          >
            {segmenting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            AI 分词
          </Button>
          {marks.size > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setMarks(new Set())}
            >
              <X className="h-4 w-4" />
              清除标记
            </Button>
          )}
        </div>

        {aiError && (
          <p className="text-xs text-destructive">AI 分词失败：{aiError}</p>
        )}

        {/* 分词结果预览 */}
        {words.length > 0 ? (
          <div className="rounded-md border bg-card p-3">
            <div className="mb-2 text-xs text-muted-foreground">
              分词结果（{words.length} 个单词）
            </div>
            <div className="flex flex-wrap gap-1.5">
              {words.map((w, i) => (
                <span
                  key={i}
                  className="rounded-md border bg-muted/40 px-2 py-0.5 text-sm"
                >
                  <ContentRenderer
                    content={{
                      format: w.includes('^') ? 'ruby' : 'text',
                      value: w,
                    }}
                  />
                </span>
              ))}
            </div>
          </div>
        ) : (
          N > 0 && (
            <p className="text-xs text-muted-foreground">
              尚未分词。点击字符间隙添加切分线后点「确认分词」，或使用「AI 分词」。
            </p>
          )
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={submitting}>
          取消
        </Button>
        <Button onClick={handleSubmit} disabled={!canSubmit}>
          保存
        </Button>
      </div>
    </div>
  )
}


