import type { AppSettings, ContentFormat, PairItem, TextItem } from '@/types'
import { uid } from './utils'
import { AiConfigError, AiResponseError, isAiConfigured } from './ai'

/**
 * AI 批量生成题目
 * - 使用「预设系统提示词 + 用户需求提示词」形式
 * - 配对题与填空题返回不同的 JSON 结构
 * - 复用 ai.ts 中的接口配置检查与错误类型
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

interface ChatMessage {
  role: 'system' | 'user'
  content: string
}

interface ChatPayload {
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

/** 从 OpenAI 兼容响应里抽取 content 文本 */
function extractContent(data: unknown): string {
  if (!data || typeof data !== 'object') {
    throw new AiResponseError('AI 响应为空')
  }
  const choices = (data as { choices?: Array<{ message?: { content?: string } }> }).choices
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new AiResponseError('AI 响应缺少 choices')
  }
  const content = choices[0]?.message?.content
  if (typeof content !== 'string') {
    throw new AiResponseError('AI 响应缺少 content')
  }
  return content
}

/** 尝试从 AI 返回的字符串里解析出 JSON 对象 */
function parseJsonObject(raw: string): Record<string, unknown> {
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

/** 通用 chat completion 调用，返回 content 字符串 */
async function callChat(settings: AppSettings, payload: ChatPayload): Promise<string> {
  // 兜底旧数据：若 settings.aiModel 缺失则用默认
  if (!payload.model) payload = { ...payload, model: 'gpt-4o-mini' }
  if (!isAiConfigured(settings)) {
    throw new AiConfigError('AI 接口未配置，请先到设置页填写 endpoint 与 api key')
  }

  const endpoint = settings.aiEndpoint.replace(/\/$/, '')
  const url = endpoint.endsWith('/chat/completions')
    ? endpoint
    : `${endpoint}/chat/completions`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.aiApiKey}`,
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new AiResponseError(`AI 接口返回 ${res.status}: ${text.slice(0, 200)}`)
  }

  const data = await res.json()
  return extractContent(data)
}

/**
 * 生成配对题
 * @param settings AI 接口配置
 * @param userPrompt 用户需求描述
 */
export async function generatePairs(
  settings: AppSettings,
  userPrompt: string,
): Promise<PairItem[]> {
  const content = await callChat(settings, buildPayload(PAIRS_SYSTEM, userPrompt, settings.aiModel))
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
 */
export async function generateTexts(
  settings: AppSettings,
  userPrompt: string,
): Promise<TextItem[]> {
  const content = await callChat(settings, buildPayload(TEXTS_SYSTEM, userPrompt, settings.aiModel))
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
