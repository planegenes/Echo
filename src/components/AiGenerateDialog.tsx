import { useEffect, useMemo, useState } from 'react'
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
import { ContentListRenderer } from '@/components/ContentRenderer'
import { parseText } from '@/lib/parser'
import { generatePairs, generateSentences, generateTexts } from '@/lib/ai-generate'
import { useSettingsValue } from '@/store/atoms'
import { isAiConfigured } from '@/lib/ai'
import { Loader2, Sparkles, Trash2, Check } from 'lucide-react'

export interface AiGenerateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  topicType: TopicType
  /** 确认添加，传入剩余（未删除）的题目 */
  onConfirm: (items: PairItem[] | TextItem[] | SentenceItem[]) => Promise<void>
}

/**
 * AI 批量生成题目对话框
 * - 输入需求描述 → 调用 AI 生成 → 在窗体中预览并删除不需要项 → 全部添加到当前专题
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

  // 关闭时重置全部状态
  useEffect(() => {
    if (!open) {
      setUserPrompt('')
      setError(null)
      setPairs([])
      setTexts([])
      setSentences([])
      setLoading(false)
      setConfirming(false)
    }
  }, [open])

  // 切换题目类型时重置结果
  useEffect(() => {
    setPairs([])
    setTexts([])
    setSentences([])
    setError(null)
  }, [topicType])

  const handleGenerate = async () => {
    const prompt = userPrompt.trim()
    if (!prompt) {
      setError('请输入需求描述')
      return
    }
    if (!aiReady) {
      setError('AI 接口未配置，请先到设置页填写 endpoint 与 api key')
      return
    }
    setLoading(true)
    setError(null)
    try {
      if (topicType === 'pairs') {
        const result = await generatePairs(settings, prompt)
        setPairs(result)
        setTexts([])
        setSentences([])
        if (result.length === 0) setError('AI 未返回有效配对')
      } else if (topicType === 'texts') {
        const result = await generateTexts(settings, prompt)
        setTexts(result)
        setPairs([])
        setSentences([])
        if (result.length === 0) setError('AI 未返回有效文本')
      } else {
        const result = await generateSentences(settings, prompt)
        setSentences(result)
        setPairs([])
        setTexts([])
        if (result.length === 0) setError('AI 未返回有效组句题')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失败')
    } finally {
      setLoading(false)
    }
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
    <Dialog open={open} onOpenChange={onOpenChange} contentClassName="max-w-2xl">
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
          <div className="flex justify-end">
            <Button
              onClick={() => void handleGenerate()}
              disabled={busy || !userPrompt.trim()}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {loading ? '生成中...' : '生成'}
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
                <div className="text-sm font-medium">{s.answer}</div>
                {s.hint && (
                  <div className="text-xs text-muted-foreground">
                    提示：{s.hint}
                  </div>
                )}
                <div className="flex flex-wrap gap-1">
                  {s.words.map((w, i) => (
                    <span
                      key={i}
                      className="rounded border bg-muted/40 px-1.5 py-0.5 text-xs"
                    >
                      {w}
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
