import type { AppSettings, ContentFormat, PairItem, TextItem } from '@/types'
import { uid } from './utils'
import {
  AiConfigError,
  AiResponseError,
  applyModelConfig,
  buildChatUrl,
  buildHeaders,
  extractContentByFormat,
  isAiConfigured,
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
  '每对配对包含左侧(left)和右侧(right)两项，可以是文本、LaTeX 或注音格式。' +
  '只返回 JSON，结构为 {"pairs":[{"left":"左侧内容","right":"右侧内容","format":"text"}]}。' +
  'format 字段可选，取值为 "text"（默认）、"latex"（公式，如 a^2+b^2=c^2）或 "ruby"（注音，如 東^と 或 {東京}^{とうきょう}）。' +
  '生成的题目应当准确、有意义、避免重复，且 left 与 right 必须存在明确的配对关系。'

const TEXTS_SYSTEM =
  '你是一个题库生成助手，负责根据用户需求生成填空题目。' +
  '每条文本用 *内容* 标记需要填空的位置（单星号），用 **内容** 标记加粗文本（双星号）。' +
  '例如：中国的首都是*北京*。光速约为**3×10^8**米/秒。' +
  '只返回 JSON，结构为 {"texts":[{"content":"文本内容，包含 *空白* 和 **加粗** 标记"}]}。' +
  '生成的题目应当准确、有意义、避免重复，每条文本应至少包含一个 *空白* 标记。'

export interface ChatMessage {
  role: 'system' | 'user'
  content: string
}

export interface ChatPayload {
  model: string
  messages: ChatMessage[]
  temperature: number
  response_format: { type: 'json_object' }
}

function buildPayload(system: string, userPrompt: string, model: string): ChatPayload {
  return {
    model: model || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `${userPrompt}\n\n严格按 JSON 结构返回。` },
    ],
    temperature: 0.7,
    response_format: { type: 'json_object' },
  }
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
 * 生成配对题
 * @param settings AI 接口配置
 * @param userPrompt 用户需求描述
 * @param opts 模型/供应商覆盖
 */
export async function generatePairs(
  settings: AppSettings,
  userPrompt: string,
  opts?: AiCallOptions,
): Promise<PairItem[]> {
  const { model } = resolveAiCall(settings, opts)
  const content = await callChat(settings, buildPayload(PAIRS_SYSTEM, userPrompt, model), opts)
  const obj = parseJsonObject(content)
  const pairs = obj.pairs
  if (!Array.isArray(pairs)) {
    throw new AiResponseError('AI 返回缺少 pairs 数组')
  }

  return pairs
    .filter((p): p is Record<string, unknown> => {
      if (!p || typeof p !== 'object') return false
      const x = p as Record<string, unknown>
      return typeof x.left === 'string' && typeof x.right === 'string'
    })
    .map((p) => {
      const format = normalizeFormat(p.format)
      return {
        id: uid('pair'),
        left: { format, value: String(p.left) },
        right: { format, value: String(p.right) },
        stats: { lr: 0, rl: 0 },
      } as PairItem
    })
}

/**
 * 生成填空题
 * @param settings AI 接口配置
 * @param userPrompt 用户需求描述
 * @param opts 模型/供应商覆盖
 */
export async function generateTexts(
  settings: AppSettings,
  userPrompt: string,
  opts?: AiCallOptions,
): Promise<TextItem[]> {
  const { model } = resolveAiCall(settings, opts)
  const content = await callChat(settings, buildPayload(TEXTS_SYSTEM, userPrompt, model), opts)
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
