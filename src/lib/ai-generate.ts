import type {
  AppSettings,
  Content,
  ContentFormat,
  PairItem,
  SentenceItem,
  TextItem,
} from '@/types'
import { uid } from './utils'
import {
  AiConfigError,
  AiResponseError,
  applyModelConfig,
  buildChatUrl,
  buildHeaders,
  extractContentByFormat,
  isAiConfigured,
  readSseStream,
  resolveAiCall,
  type AiCallOptions,
} from './ai'

/**
 * AI 批量生成题目
 * - 使用「预设系统提示词 + 用户需求提示词」形式
 * - 配对题与填空题返回不同的 JSON 结构
 * - 复用 ai.ts 中的接口配置检查与错误类型
 * - 支持题目级模型覆盖（modelOverride）与显式 providerId
 */

const PAIRS_SYSTEM =
  '你是一个题库生成助手，负责根据用户需求生成配对题目。' +
  '每对配对包含左侧(left)和右侧(right)，每侧是一个内容项数组（可以只有一个元素）。' +
  '每个内容项是对象，结构为 {"value":"内容文本","format":"格式"}，format 可选，取值为 "text"（默认）、"latex"（公式，如 a^2+b^2=c^2）或 "ruby"（注音，如 東^と 或 {東京}^{とうきょう}）。' +
  '一侧包含多个内容项时，表示该组内任意一项与另一侧任意一项都构成正确配对。' +
  '只返回 JSON，结构为 {"pairs":[{"left":[{"value":"内容","format":"text"}],"right":[{"value":"内容","format":"text"}]}]}。' +
  '生成的题目应当准确、有意义、避免重复，且 left 与 right 必须存在明确的配对关系。'

const TEXTS_SYSTEM =
  '你是一个题库生成助手，负责根据用户需求生成填空题目。' +
  '每条文本用 *内容* 标记需要填空的位置（单星号），用 **内容** 标记加粗文本（双星号）。' +
  '例如：中国的首都是*北京*。光速约为**3×10^8**米/秒。' +
  '只返回 JSON，结构为 {"texts":[{"content":"文本内容，包含 *空白* 和 **加粗** 标记"}]}。' +
  '生成的题目应当准确、有意义、避免重复，每条文本应至少包含一个 *空白* 标记。'

const SENTENCES_SYSTEM =
  '你是一个题库生成助手，负责根据用户需求生成组句题目。' +
  '每道题包含一个标准答案句子(answer)、一个提示(hint)、以及将答案切分后的单词数组(words)。' +
  'words 中的单词按原句顺序拼接应能还原 answer（忽略标点符号）。' +
  '切分粒度应为有意义的词或词组，不要切成单字。' +
  '只返回 JSON，结构为 {"sentences":[{"answer":"标准答案","hint":"提示文本","words":["单词1","单词2"]}]}。' +
  '生成的题目应当准确、有意义、避免重复。'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatPayload {
  model: string
  messages: ChatMessage[]
  temperature: number
  response_format: { type: 'json_object' }
}

/** 构造自定义 ChatPayload（供其它模块复用 callChat） */
export function buildCustomPayload(
  messages: ChatMessage[],
  model: string,
  temperature = 0,
): ChatPayload {
  return {
    model: model || 'gpt-4o-mini',
    messages,
    temperature,
    response_format: { type: 'json_object' },
  }
}

/** 尝试从 AI 返回的字符串里解析出 JSON 对象 */
export function parseJsonObject(raw: string): Record<string, unknown> {
  let obj: unknown
  try {
    obj = JSON.parse(raw)
  } catch {
    // 兼容部分模型可能输出 markdown 代码块
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new AiResponseError('AI 返回不是合法 JSON')
    obj = JSON.parse(match[0])
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new AiResponseError('AI 返回不是 JSON 对象')
  }
  return obj as Record<string, unknown>
}

function normalizeFormat(fmt: unknown): ContentFormat {
  if (fmt === 'latex' || fmt === 'ruby') return fmt
  return 'text'
}

/**
 * 通用 chat completion 调用
 * - OpenAI 格式：POST /chat/completions，body 含 messages
 * - Responses 格式：POST /responses，body 含 instructions + input
 * - 通过 opts.modelOverride 支持题目级模型覆盖
 * - 自动应用 ModelConfig（思考等级 + 自定义参数）
 */
export async function callChat(
  settings: AppSettings,
  payload: ChatPayload,
  opts?: AiCallOptions,
): Promise<string> {
  if (!isAiConfigured(settings)) {
    throw new AiConfigError('AI 接口未配置，请先到设置页添加供应商')
  }

  const { provider, model, config } = resolveAiCall(settings, opts)
  const url = buildChatUrl(provider)
  const baseBody =
    provider.apiFormat === 'responses'
      ? toResponsesPayload(payload, model)
      : { ...payload, model }
  const body = applyModelConfig(provider, model, baseBody, config)

  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(provider),
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new AiResponseError(`AI 接口返回 ${res.status}: ${text.slice(0, 200)}`)
  }

  const data = await res.json()
  return extractContentByFormat(data, provider.apiFormat)
}

/** 将 OpenAI 风格 ChatPayload 转换为 Responses API 风格 payload */
function toResponsesPayload(payload: ChatPayload, model: string): unknown {
  // 取 system 消息作为 instructions，其余作为 input
  const systemMsg = payload.messages.find((m) => m.role === 'system')
  const userMsgs = payload.messages.filter((m) => m.role !== 'system')
  return {
    model,
    instructions: systemMsg?.content ?? '',
    input: userMsgs.map((m) => m.content).join('\n\n') || '',
    temperature: payload.temperature,
    text: { format: payload.response_format },
  }
}

/**
 * 流式 chat completion 调用
 * - 与 callChat 相同的接口适配（OpenAI / Responses），额外开启 stream: true
 * - 增量文本通过 onDelta 实时回调，返回完整文本
 */
export async function callChatStream(
  settings: AppSettings,
  payload: ChatPayload,
  onDelta: (chunk: string) => void,
  opts?: AiCallOptions,
): Promise<string> {
  if (!isAiConfigured(settings)) {
    throw new AiConfigError('AI 接口未配置，请先到设置页添加供应商')
  }

  const { provider, model, config } = resolveAiCall(settings, opts)
  const url = buildChatUrl(provider)
  const baseBody = (
    provider.apiFormat === 'responses'
      ? toResponsesPayload(payload, model)
      : { ...payload, model }
  ) as Record<string, unknown>
  const body = applyModelConfig(
    provider,
    model,
    { ...baseBody, stream: true },
    config,
  )

  const res = await fetch(url, {
    method: 'POST',
    headers: { ...buildHeaders(provider), Accept: 'text/event-stream' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    // 部分服务端不支持 stream（或与 response_format 组合冲突）会拒绝请求，
    // 此时降级为非流式调用重试，保证结果可用（仅失去实时性）
    return callChat(settings, payload, opts)
  }

  return readSseStream(res, provider.apiFormat, onDelta)
}

/**
 * 以「system + 对话历史」构造 payload 并调用 AI（支持流式）
 * @param messages 完整对话历史（不含 system），最后一条通常为本次 user 需求
 */
async function runGenerate(
  settings: AppSettings,
  system: string,
  messages: ChatMessage[],
  opts: AiCallOptions | undefined,
  onStream: ((chunk: string) => void) | undefined,
): Promise<string> {
  const { model } = resolveAiCall(settings, opts)
  const payload: ChatPayload = {
    model,
    messages: [{ role: 'system', content: system }, ...messages],
    temperature: 0.7,
    response_format: { type: 'json_object' },
  }
  if (onStream) {
    return callChatStream(settings, payload, onStream, opts)
  }
  return callChat(settings, payload, opts)
}

/**
 * 生成配对题
 * @param settings AI 接口配置
 * @param messages 完整对话历史（不含 system），最后一条为本次需求；修改/重新生成时携带历史
 * @param opts 模型/供应商覆盖
 * @param onStream 流式输出回调（可选，传入则走流式接口）
 */
export async function generatePairs(
  settings: AppSettings,
  messages: ChatMessage[],
  opts?: AiCallOptions,
  onStream?: (chunk: string) => void,
): Promise<PairItem[]> {
  const content = await runGenerate(settings, PAIRS_SYSTEM, messages, opts, onStream)
  const obj = parseJsonObject(content)
  const pairs = obj.pairs
  if (!Array.isArray(pairs)) {
    throw new AiResponseError('AI 返回缺少 pairs 数组')
  }

  // 将单侧内容规范化为 Content 数组：
  // - 字符串 / 字符串数组（旧格式，用整体 format）
  // - 对象数组 [{value,format}]（新格式，各项各自格式）
  const toContents = (value: unknown, fallbackFormat: ContentFormat): Content[] => {
    const items = Array.isArray(value) ? value : [value]
    const result: Content[] = []
    for (const item of items) {
      if (typeof item === 'string' && item.trim().length > 0) {
        result.push({ format: fallbackFormat, value: item.trim() })
      } else if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>
        if (typeof o.value === 'string' && o.value.trim().length > 0) {
          const fmt = normalizeFormat(o.format)
          result.push({ format: fmt === 'text' ? fallbackFormat : fmt, value: o.value.trim() })
        }
      }
    }
    return result
  }

  return pairs
    .filter((p): p is Record<string, unknown> => {
      if (!p || typeof p !== 'object') return false
      const x = p as Record<string, unknown>
      return (
        (typeof x.left === 'string' || Array.isArray(x.left)) &&
        (typeof x.right === 'string' || Array.isArray(x.right))
      )
    })
    .map((p) => {
      const format = normalizeFormat(p.format)
      const left = toContents(p.left, format)
      const right = toContents(p.right, format)
      if (left.length === 0 || right.length === 0) return null
      return {
        id: uid('pair'),
        left,
        right,
        stats: { lr: 0, rl: 0 },
      } as PairItem
    })
    .filter((p): p is PairItem => p !== null)
}

/**
 * 生成填空题
 * @param settings AI 接口配置
 * @param messages 完整对话历史（不含 system），最后一条为本次需求；修改/重新生成时携带历史
 * @param opts 模型/供应商覆盖
 * @param onStream 流式输出回调（可选，传入则走流式接口）
 */
export async function generateTexts(
  settings: AppSettings,
  messages: ChatMessage[],
  opts?: AiCallOptions,
  onStream?: (chunk: string) => void,
): Promise<TextItem[]> {
  const content = await runGenerate(settings, TEXTS_SYSTEM, messages, opts, onStream)
  const obj = parseJsonObject(content)
  const texts = obj.texts
  if (!Array.isArray(texts)) {
    throw new AiResponseError('AI 返回缺少 texts 数组')
  }

  return texts
    .filter((t): t is Record<string, unknown> => {
      if (!t || typeof t !== 'object') return false
      const x = t as Record<string, unknown>
      return typeof x.content === 'string' && x.content.trim().length > 0
    })
    .map((t) => ({
      id: uid('text'),
      content: String(t.content),
    }) as TextItem)
}

/**
 * 生成组句题
 * AI 同时完成"生成句子"与"分词"两件事
 * @param settings AI 接口配置
 * @param messages 完整对话历史（不含 system），最后一条为本次需求；修改/重新生成时携带历史
 * @param opts 模型/供应商覆盖
 * @param onStream 流式输出回调（可选，传入则走流式接口）
 */
export async function generateSentences(
  settings: AppSettings,
  messages: ChatMessage[],
  opts?: AiCallOptions,
  onStream?: (chunk: string) => void,
): Promise<SentenceItem[]> {
  const content = await runGenerate(settings, SENTENCES_SYSTEM, messages, opts, onStream)
  const obj = parseJsonObject(content)
  const sentences = obj.sentences
  if (!Array.isArray(sentences)) {
    throw new AiResponseError('AI 返回缺少 sentences 数组')
  }

  return sentences
    .filter((s): s is Record<string, unknown> => {
      if (!s || typeof s !== 'object') return false
      const x = s as Record<string, unknown>
      return typeof x.answer === 'string' && x.answer.trim().length > 0
    })
    .map((s) => ({
      id: uid('sentence'),
      answer: String(s.answer).trim(),
      hint: typeof s.hint === 'string' ? s.hint.trim() : '',
      words: Array.isArray(s.words)
        ? s.words
            .filter((w): w is string => typeof w === 'string')
            .map((w) => w.trim())
            .filter((w) => w.length > 0)
        : [],
    }) as SentenceItem)
}
