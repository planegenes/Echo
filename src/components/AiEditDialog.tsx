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
import {
  callChatStream,
  parseJsonObject,
  type ChatMessage,
  type ChatPayload,
} from '@/lib/ai-generate'
import { resolveAiCall, isAiConfigured } from '@/lib/ai'
import { useSettingsValue } from '@/store/atoms'
import { uid } from '@/lib/utils'
import { Loader2, Wand2, Check, Undo2, RefreshCw } from 'lucide-react'

export interface AiEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  topicType: TopicType
  /** 当前题库 */
  items: PairItem[] | TextItem[] | SentenceItem[]
  /** 确认应用修改后的题库（整体替换） */
  onApply: (
    items: PairItem[] | TextItem[] | SentenceItem[],
  ) => Promise<void>
}

/**
 * 一步操作前的完整状态快照（用于「撤回」恢复到上一步）
 */
interface EditSnapshot {
  /** 操作前输入框内容（撤回时恢复到输入框） */
  prompt: string
  history: ChatMessage[]
  /** 操作前最近一次成功请求（撤回时一并恢复，保证「重新生成」重放上一次请求） */
  lastRequest: ChatMessage[] | null
  result: PairItem[] | TextItem[] | SentenceItem[] | null
}

/** 将当前题库序列化为 JSON 文本 */
function serializeItems(
  topicType: TopicType,
  items: PairItem[] | TextItem[] | SentenceItem[],
): string {
  if (topicType === 'pairs') {
    return JSON.stringify(
      (items as PairItem[]).map((p) => ({
        left: p.left.map((c) => ({ value: c.value, format: c.format })),
        right: p.right.map((c) => ({ value: c.value, format: c.format })),
      })),
    )
  }
  if (topicType === 'texts') {
    return JSON.stringify((items as TextItem[]).map((t) => ({ content: t.content })))
  }
  return JSON.stringify(
    (items as SentenceItem[]).map((s) => ({
      answer: s.answer,
      hint: s.hint,
      words: s.words,
    })),
  )
}

function buildSystem(topicType: TopicType): string {
  if (topicType === 'pairs') {
    return (
      '你是一个题库修改助手。用户会提供当前配对题库的 JSON 和修改要求，' +
      '请按要求修改题目（可增删改），返回修改后的完整题库 JSON。' +
      '结构必须与输入一致：{"pairs":[{"left":[{"value":"内容","format":"text"}],"right":[{"value":"内容","format":"text"}]}]}。' +
      'format 可选 "text"（默认）、"latex"、"ruby"。注音写法：base 与读音 ruby 都用花括号包裹并以 ^ 分隔，如 {東}^{と}、{東京}^{とうきょう}。' +
      '未要求修改的题目保持原样。'
    )
  }
  if (topicType === 'texts') {
    return (
      '你是一个题库修改助手。用户会提供当前填空题库的 JSON 和修改要求，' +
      '请按要求修改题目（可增删改），返回修改后的完整题库 JSON。' +
      '结构必须与输入一致：{"texts":[{"content":"文本内容，包含 *空白* 和 **加粗** 标记"}]}。' +
      '未要求修改的题目保持原样。'
    )
  }
  return (
    '你是一个题库修改助手。用户会提供当前组句题库的 JSON 和修改要求，' +
    '请按要求修改题目（可增删改），返回修改后的完整题库 JSON。' +
    '结构必须与输入一致：{"sentences":[{"answer":"标准答案","hint":"提示","words":["单词1","单词2"]}]}。' +
    '支持注音（Ruby）标记：base 与读音 ruby 用 ^ 分隔。' +
    '注音写法：base 与读音 ruby 都用花括号包裹并以 ^ 分隔，如 {排}^{paai}、{排骨}^{paai gwat}。' +
    '注音应尽量按单个汉字逐字标注（如 排^{paai}骨^{gwat}），仅当词的整体读音无法逐字拆分时（如日语 {今日}^{きょう}）才用整体注音。' +
    '注音标记整体视为一个不可拆分的词单元——words 中不要把 base 与 ruby 拆成两个单词，例如 排^{paai}骨^{gwat} 应整体作为一个 word。' +
    '未要求修改的题目保持原样。'
  )
}

/**
 * 生成内容匹配键，用于在 AI 修改后匹配原题目以继承学习进度
 */
function contentKey(
  topicType: TopicType,
  item: PairItem | TextItem | SentenceItem,
): string {
  if (topicType === 'pairs') {
    const p = item as PairItem
    const ser = (c: { value: string; format: string }[]) =>
      c.map((x) => `${x.format}:${x.value}`).join('\x00')
    return `${ser(p.left)}\x01${ser(p.right)}`
  }
  if (topicType === 'texts') return (item as TextItem).content
  return (item as SentenceItem).answer
}

/**
 * AI 修改后保留原题目的学习进度
 * - 按内容匹配原题目，继承 id / mastery / stats / streaks / aiModel
 * - 新增的题目（无匹配）保持 AI 返回的新 ID 和默认进度
 */
function preserveProgress<T extends PairItem | TextItem | SentenceItem>(
  topicType: TopicType,
  parsed: T[],
  source: T[],
): T[] {
  const byKey = new Map<string, T>()
  for (const s of source) byKey.set(contentKey(topicType, s), s)
  return parsed.map((item) => {
    const orig = byKey.get(contentKey(topicType, item))
    if (!orig) return item
    // 继承原题目的学习进度字段
    return {
      ...item,
      id: (orig as any).id,
      mastery: (orig as any).mastery,
      correctStreak: (orig as any).correctStreak,
      wrongStreak: (orig as any).wrongStreak,
      aiModel: (orig as any).aiModel,
      stats: (orig as any).stats ?? (item as any).stats,
    } as T
  })
}

/** 将 AI 返回的原始 JSON 解析为题目数组（与生成功能同一套规范化规则） */
function parseEdited(
  topicType: TopicType,
  obj: Record<string, unknown>,
): PairItem[] | TextItem[] | SentenceItem[] {
  if (topicType === 'pairs') {
    const arr = Array.isArray(obj.pairs) ? obj.pairs : []
    const items: PairItem[] = []
    for (const raw of arr) {
      if (!raw || typeof raw !== 'object') continue
      const r = raw as Record<string, unknown>
      const toContents = (side: unknown): { value: string; format: 'text' | 'latex' | 'ruby' }[] => {
        const list = Array.isArray(side) ? side : [side]
        const out: { value: string; format: 'text' | 'latex' | 'ruby' }[] = []
        for (const it of list) {
          if (typeof it === 'string' && it.trim()) {
            out.push({ value: it.trim(), format: 'text' })
          } else if (it && typeof it === 'object') {
            const o = it as Record<string, unknown>
            if (typeof o.value === 'string' && o.value.trim()) {
              const fmt = o.format === 'latex' || o.format === 'ruby' ? o.format : 'text'
              out.push({ value: o.value.trim(), format: fmt })
            }
          }
        }
        return out
      }
      const left = toContents(r.left)
      const right = toContents(r.right)
      if (left.length === 0 || right.length === 0) continue
      items.push({
        id: uid('pair'),
        left,
        right,
        stats: { lr: 0, rl: 0 },
      })
    }
    return items
  }
  if (topicType === 'texts') {
    const arr = Array.isArray(obj.texts) ? obj.texts : []
    return arr
      .filter((t): t is Record<string, unknown> => {
        return !!t && typeof t === 'object' && typeof (t as Record<string, unknown>).content === 'string'
      })
      .map((t) => ({ id: uid('text'), content: String((t as Record<string, unknown>).content) }))
  }
  const arr = Array.isArray(obj.sentences) ? obj.sentences : []
  return arr
    .filter((s): s is Record<string, unknown> => {
      return !!s && typeof s === 'object' && typeof (s as Record<string, unknown>).answer === 'string'
    })
    .map((s) => ({
      id: uid('sentence'),
      answer: String(s.answer).trim(),
      hint: typeof s.hint === 'string' ? s.hint.trim() : '',
      words: Array.isArray(s.words)
        ? s.words.filter((w): w is string => typeof w === 'string' && w.trim().length > 0)
        : [],
    }))
}

/**
 * AI 修改题库对话框
 * - 将当前题库序列化 + 用户修改要求传给 AI，接收修改后的完整题库
 * - 实时流式显示 AI 输出，预览修改结果后确认整体替换
 */
export function AiEditDialog({
  open,
  onOpenChange,
  topicType,
  items,
  onApply,
}: AiEditDialogProps) {
  const settings = useSettingsValue()
  const aiReady = isAiConfigured(settings)

  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [result, setResult] = useState<PairItem[] | TextItem[] | SentenceItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** 本轮对话历史（user/assistant 交替），用于「继续修改」携带上下文与「重新生成」 */
  const [history, setHistory] = useState<ChatMessage[]>([])
  /** 撤回栈：每次成功修改/重新生成前记录一份快照，撤回时恢复到上一步 */
  const [steps, setSteps] = useState<EditSnapshot[]>([])
  /** 最近一次成功请求的 messages（不含 system）；「重新生成」严格重放它 */
  const [lastRequest, setLastRequest] = useState<ChatMessage[] | null>(null)
  const streamRef = useRef<HTMLPreElement | null>(null)

  // 流式输出自动滚动
  useEffect(() => {
    const el = streamRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [streamText])

  // 关闭时重置（渲染期调整）
  const [prevOpen, setPrevOpen] = useState(open)
  if (prevOpen !== open) {
    setPrevOpen(open)
    if (!open) {
      setPrompt('')
      setStreamText('')
      setResult(null)
      setError(null)
      setLoading(false)
      setHistory([])
      setSteps([])
      setLastRequest(null)
    }
  }

  // 切换类型时重置
  const [prevType, setPrevType] = useState(topicType)
  if (prevType !== topicType) {
    setPrevType(topicType)
    setResult(null)
    setStreamText('')
    setError(null)
    setHistory([])
    setSteps([])
    setLastRequest(null)
  }

  const sourceCount = useMemo(() => items.length, [items])

  const handleEdit = async (
    mode: 'generate' | 'modify' | 'regenerate',
  ) => {
    const req = prompt.trim()
    if (mode !== 'regenerate' && !req) {
      setError('请输入修改要求')
      return
    }
    if (!aiReady) {
      setError('AI 接口未配置，请先到设置页填写 endpoint 与 api key')
      return
    }
    if (sourceCount === 0) {
      setError('当前题库为空，无法修改')
      return
    }

    // 当前题库始终作为上下文基座（每次请求都带上最新题库，避免结果漂移）
    const serialized = serializeItems(topicType, items)

    // 构造本次请求的消息历史
    let messages: ChatMessage[]
    let nextHistoryBase: ChatMessage[]
    if (mode === 'regenerate') {
      // 重新生成：严格重放上一次成功请求（messages 完全相同），利用 AI 随机性获得新结果
      messages = lastRequest && lastRequest.length > 0 ? lastRequest : history
      nextHistoryBase =
        history.at(-1)?.role === 'assistant' ? history.slice(0, -1) : history
    } else {
      // 本次用户消息：携带当前题库 JSON + 修改要求
      const userMsg = `当前题库（JSON）：\n${serialized}\n\n修改要求：${req}\n\n请返回修改后的完整题库 JSON。`
      messages = [...history, { role: 'user', content: userMsg }]
      nextHistoryBase = messages
    }
    if (messages.length === 0) return

    // 操作前快照（仅成功时入栈，失败不产生可撤回步骤）
    const snapshot: EditSnapshot = {
      prompt,
      history: [...history],
      lastRequest,
      result,
    }

    setLoading(true)
    setError(null)
    setStreamText('')
    setResult(null)
    try {
      const { model } = resolveAiCall(settings)
      const payload: ChatPayload = {
        model,
        messages: [
          { role: 'system', content: buildSystem(topicType) },
          ...messages,
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }
      let fullText = ''
      const content = await callChatStream(settings, payload, (chunk) => {
        fullText += chunk
        setStreamText(fullText)
      })
      const obj = parseJsonObject(content)
      const parsed = parseEdited(topicType, obj)
      if (parsed.length === 0) {
        setError('AI 未返回有效题目，请调整要求后重试')
        return
      }
      // 保留原题目的学习进度（熟练度/答题统计/连对连错/模型覆盖）
      const preserved = preserveProgress(topicType, parsed, items)
      setSteps((stack) => [...stack, snapshot])
      setLastRequest(messages)
      setHistory([...nextHistoryBase, { role: 'assistant', content: fullText }])
      setResult(preserved)
      if (mode !== 'regenerate') setPrompt('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '修改失败')
    } finally {
      setLoading(false)
    }
  }

  /** 撤回：回到上一步，恢复上一次输入、对话历史与上一步的结果 */
  const handleUndo = () => {
    if (steps.length === 0) return
    const snapshot = steps[steps.length - 1]
    setSteps(steps.slice(0, -1))
    setPrompt(snapshot.prompt)
    setHistory(snapshot.history)
    setLastRequest(snapshot.lastRequest)
    setResult(snapshot.result)
    setStreamText('')
    setError(null)
  }

  const handleApply = async () => {
    if (!result) return
    setLoading(true)
    try {
      await onApply(result)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : '应用失败')
    } finally {
      setLoading(false)
    }
  }

  const busy = loading

  return (
    <Dialog open={open} onOpenChange={onOpenChange} contentClassName="max-w-[min(42rem,90vw)]">
      <DialogHeader>
        <DialogTitle>AI 修改题库</DialogTitle>
        <DialogDescription>
          将当前题库（{sourceCount} 条）序列化后连同修改要求发送给 AI，接收修改后的完整题库并整体替换。
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>修改要求</Label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="例如：把城市配对改成以省为主题，删除重复项，补充 5 道新题"
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
            {/* 有历史时才显示「重新生成」：重复上一次请求获得不同结果 */}
            {history.length > 0 && (
              <Button
                variant="outline"
                onClick={() => void handleEdit('regenerate')}
                disabled={busy || !aiReady || sourceCount === 0}
                title="重复上一次的请求（各参数不变）重新生成，用于获得不同的随机结果"
              >
                <RefreshCw className="h-4 w-4" />
                重新生成
              </Button>
            )}
            {/* 无历史显示「开始修改」，有历史显示「继续修改」（携带对话历史） */}
            <Button
              onClick={() =>
                void handleEdit(history.length > 0 ? 'modify' : 'generate')
              }
              disabled={busy || !prompt.trim() || sourceCount === 0}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              {loading
                ? '修改中...'
                : history.length > 0
                  ? '继续修改'
                  : '开始修改'}
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* 流式输出 */}
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

        {/* 题目预览：始终显示——未修改时显示当前题库，AI 返回后显示修改结果 */}
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">
            {result
              ? `修改后共 ${result.length} 条，确认后将整体替换当前题库。`
              : `当前题库（共 ${items.length} 条），输入修改要求后 AI 将修改以下题目。`}
          </div>
          <ul className="max-h-60 space-y-1.5 overflow-y-auto pr-1">
            {(result ?? items).slice(0, 50).map((item, i) => {
                if (topicType === 'pairs') {
                  const p = item as PairItem
                  return (
                    <li
                      key={i}
                      className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        <ContentListRenderer contents={p.left} />
                      </span>
                      <span className="text-muted-foreground">↔</span>
                      <span className="min-w-0 flex-1 truncate">
                        <ContentListRenderer contents={p.right} />
                      </span>
                    </li>
                  )
                }
                if (topicType === 'texts') {
                  const t = item as TextItem
                  return (
                    <li
                      key={i}
                      className="truncate rounded-md border bg-card px-3 py-1.5 text-sm"
                    >
                      {t.content}
                    </li>
                  )
                }
                const s = item as SentenceItem
                return (
                  <li
                    key={i}
                    className="rounded-md border bg-card px-3 py-1.5 text-sm"
                  >
                    <div className="truncate">
                      <ContentRenderer
                        content={{
                          format: s.answer.includes('^') ? 'ruby' : 'text',
                          value: s.answer,
                        }}
                      />
                    </div>
                    {s.hint && (
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        提示：{s.hint}
                      </div>
                    )}
                    {s.words.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {s.words.slice(0, 12).map((w, i) => (
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
                        {s.words.length > 12 && (
                          <span className="text-xs text-muted-foreground">
                            …+{s.words.length - 12}
                          </span>
                        )}
                      </div>
                    )}
                    <Badge variant="outline" className="mt-1 text-xs">
                      {s.words.length} 词
                    </Badge>
                  </li>
                )
              })}
              {(result ?? items).length > 50 && (
                <li className="py-1 text-center text-xs text-muted-foreground">
                  其余 {(result ?? items).length - 50} 条略…
                </li>
              )}
            </ul>
          </div>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
          取消
        </Button>
        <Button onClick={() => void handleApply()} disabled={busy || !result}>
          <Check className="h-4 w-4" />
          应用替换
        </Button>
      </div>
      <DialogClose />
    </Dialog>
  )
}
