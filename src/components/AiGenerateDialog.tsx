import { useEffect, useMemo, useRef, useState } from 'react'
import type { PairItem, SentenceItem, TextItem, TopicType } from '@/types'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogClose,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { ContentListRenderer, ContentRenderer } from '@/components/ContentRenderer'
import { parseText } from '@/lib/parser'
import {
  generatePairs,
  generateSentences,
  generateTexts,
  type ChatMessage,
} from '@/lib/ai-generate'
import { useSettingsValue } from '@/store/atoms'
import { isAiConfigured } from '@/lib/ai'
import { Loader2, Sparkles, RefreshCw, Trash2, Check, Undo2 } from 'lucide-react'

export interface AiGenerateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  topicType: TopicType
  /** 确认添加，传入剩余（未删除）的题目 */
  onConfirm: (items: PairItem[] | TextItem[] | SentenceItem[]) => Promise<void>
}

/**
 * 一步操作前的完整状态快照（用于「撤回」恢复到上一步）
 */
interface StepSnapshot {
  /** 操作前输入框内容（撤回时恢复到输入框） */
  prompt: string
  history: ChatMessage[]
  /** 操作前最近一次成功请求（撤回时一并恢复，保证「重新生成」重放上一次请求） */
  lastRequest: ChatMessage[] | null
  pairs: PairItem[]
  texts: TextItem[]
  sentences: SentenceItem[]
}

/**
 * AI 批量生成题目对话框
 * - 输入需求描述 → 调用 AI 生成 → 在窗体中预览并删除不需要项 → 全部添加到当前专题
 * - 生成 / 修改后可「撤回」回到上一步（恢复上一次输入与结果），也可「重新生成」直接重复上一轮的生成
 * - 配对题与填空题使用各自预设的提示词与返回格式
 */
export function AiGenerateDialog({
  open,
  onOpenChange,
  topicType,
  onConfirm,
}: AiGenerateDialogProps) {
  const settings = useSettingsValue()
  const aiReady = isAiConfigured(settings)

  const [userPrompt, setUserPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pairs, setPairs] = useState<PairItem[]>([])
  const [texts, setTexts] = useState<TextItem[]>([])
  const [sentences, setSentences] = useState<SentenceItem[]>([])
  const [confirming, setConfirming] = useState(false)
  /** 本轮对话历史（user/assistant 交替），用于「修改」携带上下文与「重新生成」 */
  const [history, setHistory] = useState<ChatMessage[]>([])
  /** 撤回栈：每次成功生成/修改/重新生成前记录一份快照，撤回时恢复到上一步 */
  const [steps, setSteps] = useState<StepSnapshot[]>([])
  /** 最近一次成功请求的 messages（不含 system）；「重新生成」严格重放它 */
  const [lastRequest, setLastRequest] = useState<ChatMessage[] | null>(null)
  /** 当前流式输出（生成过程中实时累积） */
  const [streamText, setStreamText] = useState('')
  const streamRef = useRef<HTMLPreElement | null>(null)

  // 流式输出自动滚动到底部
  useEffect(() => {
    const el = streamRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [streamText])

  // 关闭时重置全部状态（渲染期调整）
  const [prevOpen, setPrevOpen] = useState(open)
  if (prevOpen !== open) {
    setPrevOpen(open)
    if (!open) {
      setUserPrompt('')
      setError(null)
      setPairs([])
      setTexts([])
      setSentences([])
      setLoading(false)
      setConfirming(false)
      setHistory([])
      setSteps([])
      setLastRequest(null)
      setStreamText('')
    }
  }

  // 切换题目类型时重置结果与历史（渲染期调整）
  const [prevTopicType, setPrevTopicType] = useState(topicType)
  if (prevTopicType !== topicType) {
    setPrevTopicType(topicType)
    setPairs([])
    setTexts([])
    setSentences([])
    setError(null)
    setHistory([])
    setSteps([])
    setLastRequest(null)
    setStreamText('')
  }

  /**
   * 生成 / 修改 / 重新生成
   * - generate：历史为空时首次生成
   * - modify：追加新 user 消息并携带完整历史
   * - regenerate：严格重放上一次成功请求（messages 与参数不变），利用 AI 随机性获得新结果
   */
  const handleGenerate = async (mode: 'generate' | 'modify' | 'regenerate') => {
    const prompt = userPrompt.trim()
    if (!aiReady) {
      setError('AI 接口未配置，请先到设置页填写 endpoint 与 api key')
      return
    }
    if (mode !== 'regenerate' && !prompt) {
      setError('请输入需求描述')
      return
    }

    // 构造本次请求的消息历史
    let messages: ChatMessage[]
    let nextHistoryBase: ChatMessage[]
    if (mode === 'regenerate') {
      // 重新生成：严格重放上一次成功请求（messages 完全相同），利用 AI 随机性获得新结果
      messages = lastRequest && lastRequest.length > 0 ? lastRequest : history
      // 历史基座：去掉最后一条 assistant（本次结果将替换它）
      nextHistoryBase =
        history.at(-1)?.role === 'assistant' ? history.slice(0, -1) : history
    } else {
      messages = [...history, { role: 'user', content: prompt }]
      nextHistoryBase = messages
    }
    if (messages.length === 0) return

    // 操作前快照（仅生成成功时入栈，失败不产生可撤回步骤）
    const snapshot: StepSnapshot = {
      prompt: userPrompt,
      history: [...history],
      lastRequest,
      pairs: [...pairs],
      texts: [...texts],
      sentences: [...sentences],
    }

    setLoading(true)
    setError(null)
    setStreamText('')
    setPairs([])
    setTexts([])
    setSentences([])
    try {
      let fullText = ''
      const onStream = (chunk: string) => {
        fullText += chunk
        setStreamText(fullText)
      }
      if (topicType === 'pairs') {
        const result = await generatePairs(settings, messages, undefined, onStream)
        setPairs(result)
        if (result.length === 0) setError('AI 未返回有效配对')
      } else if (topicType === 'texts') {
        const result = await generateTexts(settings, messages, undefined, onStream)
        setTexts(result)
        if (result.length === 0) setError('AI 未返回有效文本')
      } else {
        const result = await generateSentences(settings, messages, undefined, onStream)
        setSentences(result)
        if (result.length === 0) setError('AI 未返回有效组句题')
      }
      setSteps((stack) => [...stack, snapshot])
      setLastRequest(messages)
      setHistory([...nextHistoryBase, { role: 'assistant', content: fullText }])
      if (mode !== 'regenerate') setUserPrompt('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失败')
    } finally {
      setLoading(false)
    }
  }

  /** 撤回：回到上一步，恢复上一次输入、对话历史与上一步的结果 */
  const handleUndo = () => {
    if (steps.length === 0) return
    const snapshot = steps[steps.length - 1]
    setSteps(steps.slice(0, -1))
    setUserPrompt(snapshot.prompt)
    setHistory(snapshot.history)
    setLastRequest(snapshot.lastRequest)
    setPairs(snapshot.pairs)
    setTexts(snapshot.texts)
    setSentences(snapshot.sentences)
    setStreamText('')
    setError(null)
  }

  const handleRemovePair = (id: string) => {
    setPairs((arr) => arr.filter((p) => p.id !== id))
  }
  const handleRemoveText = (id: string) => {
    setTexts((arr) => arr.filter((t) => t.id !== id))
  }
  const handleRemoveSentence = (id: string) => {
    setSentences((arr) => arr.filter((s) => s.id !== id))
  }

  const remaining =
    topicType === 'pairs'
      ? pairs.length
      : topicType === 'texts'
        ? texts.length
        : sentences.length

  const handleConfirm = async () => {
    if (remaining === 0) return
    setConfirming(true)
    setError(null)
    try {
      if (topicType === 'pairs') {
        await onConfirm(pairs)
      } else if (topicType === 'texts') {
        await onConfirm(texts)
      } else {
        await onConfirm(sentences)
      }
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : '添加失败')
    } finally {
      setConfirming(false)
    }
  }

  const busy = loading || confirming
  const placeholder =
    topicType === 'pairs'
      ? '例如：生成 10 个中国省份与省会的配对'
      : topicType === 'texts'
        ? '例如：生成 8 道关于中国历史的填空题，每题包含 1-2 个空白'
        : '例如：生成 10 道英语日常对话组句题，附中文提示'

  const titleSuffix =
    topicType === 'pairs' ? '配对题' : topicType === 'texts' ? '填空题' : '组句题'

  return (
    <Dialog open={open} onOpenChange={onOpenChange} contentClassName="max-w-[min(42rem,90vw)]">
      <DialogHeader>
        <DialogTitle>AI 批量生成{titleSuffix}</DialogTitle>
        <DialogDescription>
          输入需求，AI 将根据预设模板批量生成题目。可在结果中删除不需要的项后再添加到当前专题。
        </DialogDescription>
      </DialogHeader>

      {!aiReady && (
        <div className="mb-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
          AI 接口未配置，请先到设置页填写 endpoint 与 api key。
        </div>
      )}

      <div className="space-y-4">
        {/* 需求输入 */}
        <div className="space-y-2">
          <Label>需求描述</Label>
          <Textarea
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            rows={3}
            placeholder={placeholder}
            disabled={busy}
          />
          <div className="flex justify-end gap-2">
            {/* 有可撤回步骤时显示「撤回」：回到上一步并恢复上一次输入 */}
            {steps.length > 0 && (
              <Button
                variant="outline"
                onClick={handleUndo}
                disabled={busy}
                title="回到上一步，恢复上一次输入与结果"
              >
                <Undo2 className="h-4 w-4" />
                撤回
              </Button>
            )}
            {/* 有历史时才显示「重新生成」：直接重复上一轮的生成 */}
            {history.length > 0 && (
              <Button
                variant="outline"
                onClick={() => void handleGenerate('regenerate')}
                disabled={busy || !aiReady}
                title="重复上一次的请求（各参数不变）重新生成，用于获得不同的随机结果"
              >
                <RefreshCw className="h-4 w-4" />
                重新生成
              </Button>
            )}
            {/* 无历史显示「生成」，有历史显示「修改」（携带对话历史） */}
            <Button
              onClick={() =>
                void handleGenerate(history.length > 0 ? 'modify' : 'generate')
              }
              disabled={busy || !userPrompt.trim()}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {loading ? '生成中...' : history.length > 0 ? '修改' : '生成'}
            </Button>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* 结果列表 */}
        {topicType === 'pairs' ? (
          <PairResultList pairs={pairs} onRemove={handleRemovePair} disabled={busy} />
        ) : topicType === 'texts' ? (
          <TextResultList texts={texts} onRemove={handleRemoveText} disabled={busy} />
        ) : (
          <SentenceResultList
            sentences={sentences}
            onRemove={handleRemoveSentence}
            disabled={busy}
          />
        )}

        {/* 流式输出：生成过程中实时显示 AI 输出，位于结果列表下方 */}
        {streamText && (
          <div className="rounded-md border bg-muted/20 px-3 py-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">AI 输出</span>
              {loading && (
                <span className="text-xs text-muted-foreground">
                  <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                  实时生成中
                </span>
              )}
            </div>
            <pre
              ref={streamRef}
              className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words font-mono text-xs text-foreground/80"
            >
              {streamText}
            </pre>
          </div>
        )}
      </div>

      {/* 底部按钮 */}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
          取消
        </Button>
        <Button onClick={() => void handleConfirm()} disabled={busy || remaining === 0}>
          <Check className="h-4 w-4" />
          全部添加{remaining > 0 ? ` (${remaining})` : ''}
        </Button>
      </div>

      <DialogClose />
    </Dialog>
  )
}

interface PairResultListProps {
  pairs: PairItem[]
  onRemove: (id: string) => void
  disabled: boolean
}

function PairResultList({ pairs, onRemove, disabled }: PairResultListProps) {
  if (pairs.length === 0) return null
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          生成结果（{pairs.length}）
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => pairs.forEach((p) => onRemove(p.id))}
          disabled={disabled}
        >
          清空
        </Button>
      </div>
      <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
        {pairs.map((pair) => {
          const hasSpecialFormat =
            pair.left.some((c) => c.format !== 'text') ||
            pair.right.some((c) => c.format !== 'text')
          return (
            <li
              key={pair.id}
              className="flex items-center gap-2 rounded-md border bg-card px-3 py-2"
            >
              <div className="flex flex-1 items-center gap-2 min-w-0">
                <span className="min-w-0 flex-1 truncate text-sm">
                  <ContentListRenderer contents={pair.left} />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  <ContentListRenderer contents={pair.right} />
                </span>
              </div>
              {hasSpecialFormat && (
                <Badge variant="outline" className="shrink-0">
                  {pair.left.some((c) => c.format === 'latex') ||
                  pair.right.some((c) => c.format === 'latex')
                    ? 'LaTeX'
                    : '注音'}
                </Badge>
              )}
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onRemove(pair.id)}
                title="删除"
                disabled={disabled}
                className="shrink-0"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

interface TextResultListProps {
  texts: TextItem[]
  onRemove: (id: string) => void
  disabled: boolean
}

function TextResultList({ texts, onRemove, disabled }: TextResultListProps) {
  if (texts.length === 0) return null
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          生成结果（{texts.length}）
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => texts.forEach((t) => onRemove(t.id))}
          disabled={disabled}
        >
          清空
        </Button>
      </div>
      <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {texts.map((text) => (
          <li key={text.id} className="rounded-md border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <TextPreview content={text.content} />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onRemove(text.id)}
                title="删除"
                disabled={disabled}
                className="shrink-0"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function TextPreview({ content }: { content: string }) {
  const parsed = useMemo(() => parseText(content), [content])
  const blankCount = parsed.blanks.length
  return (
    <div className="flex-1 space-y-1">
      <div className="whitespace-pre-wrap break-words text-sm leading-loose">
        {parsed.segments.map((seg, i) => {
          if (seg.type === 'text') return <span key={i}>{seg.value}</span>
          if (seg.type === 'bold')
            return (
              <strong key={i} className="font-semibold">
                {seg.value}
              </strong>
            )
          return (
            <span
              key={seg.id}
              className="mx-0.5 inline-block border-b-2 border-current px-1 text-primary"
            >
              {seg.answer}
            </span>
          )
        })}
      </div>
      <Badge variant="outline" className="text-xs">
        {blankCount} 空白
      </Badge>
    </div>
  )
}

interface SentenceResultListProps {
  sentences: SentenceItem[]
  onRemove: (id: string) => void
  disabled: boolean
}

function SentenceResultList({
  sentences,
  onRemove,
  disabled,
}: SentenceResultListProps) {
  if (sentences.length === 0) return null
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          生成结果（{sentences.length}）
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => sentences.forEach((s) => onRemove(s.id))}
          disabled={disabled}
        >
          清空
        </Button>
      </div>
      <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {sentences.map((s) => (
          <li key={s.id} className="rounded-md border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 space-y-1.5">
                <div className="text-sm font-medium">
                  <ContentRenderer
                    content={{
                      format: s.answer.includes('^') ? 'ruby' : 'text',
                      value: s.answer,
                    }}
                  />
                </div>
                {s.hint && (
                  <div className="text-xs text-muted-foreground">
                    提示：{s.hint}
                  </div>
                )}
                <div className="flex flex-wrap gap-1">
                  {s.words.map((w, i) => (
                    <span
                      key={i}
                      className="rounded border bg-muted/40 px-1.5 py-0.5 text-sm"
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
                <Badge variant="outline" className="text-xs">
                  {s.words.length} 词
                </Badge>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onRemove(s.id)}
                title="删除"
                disabled={disabled}
                className="shrink-0"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
