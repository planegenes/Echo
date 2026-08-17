import type {
  AiApiFormat,
  AiJudgeBlankResult,
  AiJudgeRequest,
  AiJudgeResponse,
  AiProvider,
  AppSettings,
  ModelConfig,
} from '@/types'
import { buildThinkingParams, getModelConfig } from './ai-providers'

/**
 * AI 评判客户端
 * - 支持多供应商配置（settings.aiProviders）
 * - 默认采用 OpenAI 兼容 /chat/completions 接口
 * - 同时支持 OpenAI Responses API (/responses)
 * - 接口配置保存在 settings，不上传服务器
 */

export class AiConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiConfigError'
  }
}

export class AiResponseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiResponseError'
  }
}

/** AI 调用可选项 */
export interface AiCallOptions {
  /** 题目级模型覆盖；为空时使用 settings.defaultAiModel */
  modelOverride?: string
  /** 显式指定使用的供应商 id；为空时自动查找包含该模型的供应商 */
  providerId?: string | null
}

/** 检查 AI 接口已配置可用（默认供应商存在且 baseUrl/Key 已填） */
export function isAiConfigured(settings: AppSettings): boolean {
  const provider = getDefaultProvider(settings)
  if (!provider) return false
  return provider.baseUrl.trim().length > 0 && provider.apiKey.trim().length > 0
}

/** 获取默认供应商 */
export function getDefaultProvider(settings: AppSettings): AiProvider | null {
  if (!settings.aiProviders || settings.aiProviders.length === 0) return null
  if (settings.defaultAiProviderId) {
    const found = settings.aiProviders.find((p) => p.id === settings.defaultAiProviderId)
    if (found) return found
  }
  return settings.aiProviders[0] ?? null
}

/** 按 id 获取供应商 */
export function getProviderById(
  settings: AppSettings,
  providerId: string | null | undefined,
): AiProvider | null {
  if (!providerId) return getDefaultProvider(settings)
  return settings.aiProviders.find((p) => p.id === providerId) ?? null
}

/**
 * 查找包含指定模型的供应商
 * - 优先匹配 defaultProvider
 * - 其次按 aiProviders 顺序查找 models 列表
 * - 找不到则返回 defaultProvider
 */
export function findProviderForModel(
  settings: AppSettings,
  modelId: string,
): AiProvider | null {
  if (!settings.aiProviders || settings.aiProviders.length === 0) return null
  // 1. 默认供应商优先
  const defaultP = getDefaultProvider(settings)
  if (defaultP && (defaultP.models ?? []).includes(modelId)) return defaultP
  // 2. 任意供应商 models 包含
  for (const p of settings.aiProviders) {
    if ((p.models ?? []).includes(modelId)) return p
  }
  // 3. 兜底：默认供应商
  return defaultP
}

/** 解析此次调用要使用的供应商、模型与配置 */
export function resolveAiCall(
  settings: AppSettings,
  opts?: AiCallOptions,
): { provider: AiProvider; model: string; config: ModelConfig } {
  const model =
    (opts?.modelOverride && opts.modelOverride.trim()) ||
    settings.defaultAiModel ||
    'gpt-4o-mini'
  // 1. 显式指定 providerId
  let provider: AiProvider | null = null
  if (opts?.providerId) {
    provider = getProviderById(settings, opts.providerId)
  }
  // 2. 自动查找包含该模型的供应商
  if (!provider) {
    provider = findProviderForModel(settings, model)
  }
  if (!provider) {
    throw new AiConfigError('AI 供应商未配置，请先到设置页添加供应商')
  }
  if (provider.baseUrl.trim().length === 0 || provider.apiKey.trim().length === 0) {
    throw new AiConfigError(
      `供应商「${provider.name}」缺少 baseUrl 或 apiKey，请到设置页补全`,
    )
  }
  const config = getModelConfig(provider, model)
  return { provider, model, config }
}

/** 构造 OpenAI 兼容风格的 messages payload */
function buildOpenAiJudgePayload(req: AiJudgeRequest, model: string): unknown {
  const blanksBlock = req.blanks
    .map(
      (b, i) =>
        `#${i + 1} 用户答案: "${b.userAnswer}"  标准答案: "${b.standardAnswer}"`,
    )
    .join('\n')

  const system =
    '你是一个学习助手，负责判断填空题答案是否与标准答案语义一致。' +
    '允许同义词、大小写差异、轻微的标点差异视为正确。' +
    '只返回 JSON，结构为 {"results":[{"blankId":string,"correct":boolean,"standardAnswer":string,"reason":string}]}。'

  const user =
    `原文：\n${req.text}\n\n需要判断的空白：\n${blanksBlock}\n\n` +
    `请严格按 JSON 结构返回，blankId 必须与下列 id 一一对应：${req.blanks
      .map((b) => b.id)
      .join(', ')}`

  return {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0,
    response_format: { type: 'json_object' },
  }
}

/** 构造 OpenAI Responses API payload（input 数组形式） */
function buildResponsesJudgePayload(req: AiJudgeRequest, model: string): unknown {
  const blanksBlock = req.blanks
    .map(
      (b, i) =>
        `#${i + 1} 用户答案: "${b.userAnswer}"  标准答案: "${b.standardAnswer}"`,
    )
    .join('\n')

  const system =
    '你是一个学习助手，负责判断填空题答案是否与标准答案语义一致。' +
    '允许同义词、大小写差异、轻微的标点差异视为正确。' +
    '只返回 JSON，结构为 {"results":[{"blankId":string,"correct":boolean,"standardAnswer":string,"reason":string}]}。'

  const user =
    `原文：\n${req.text}\n\n需要判断的空白：\n${blanksBlock}\n\n` +
    `请严格按 JSON 结构返回，blankId 必须与下列 id 一一对应：${req.blanks
      .map((b) => b.id)
      .join(', ')}`

  return {
    model,
    instructions: system,
    input: user,
    temperature: 0,
    text: { format: { type: 'json_object' } },
  }
}

/** 从 OpenAI 兼容响应里抽取 content 文本 */
function extractOpenAiContent(data: unknown): string {
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

/** 从 OpenAI Responses API 响应里抽取 content 文本 */
function extractResponsesContent(data: unknown): string {
  if (!data || typeof data !== 'object') {
    throw new AiResponseError('AI 响应为空')
  }
  const obj = data as {
    output_text?: string
    output?: Array<{
      type?: string
      content?: Array<{ type?: string; text?: string }>
    }>
  }
  // 优先使用 output_text（OpenAI SDK 便捷字段）
  if (typeof obj.output_text === 'string' && obj.output_text.length > 0) {
    return obj.output_text
  }
  const output = obj.output
  if (!Array.isArray(output)) {
    throw new AiResponseError('Responses API 响应缺少 output')
  }
  // 寻找 message 类型项中的 output_text
  for (const item of output) {
    if (item.type === 'message' && Array.isArray(item.content)) {
      for (const c of item.content) {
        if (c.type === 'output_text' && typeof c.text === 'string') {
          return c.text
        }
      }
    }
  }
  throw new AiResponseError('Responses API 响应缺少 output_text')
}

/** 尝试从 AI 返回的字符串里解析出 results 数组 */
function parseResults(raw: string, expectedIds: string[]): AiJudgeBlankResult[] {
  let obj: unknown
  try {
    obj = JSON.parse(raw)
  } catch {
    // 兼容部分模型可能输出 markdown 代码块
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new AiResponseError('AI 返回不是合法 JSON')
    obj = JSON.parse(match[0])
  }

  const results = (obj as { results?: unknown }).results
  if (!Array.isArray(results)) {
    throw new AiResponseError('AI 返回缺少 results 数组')
  }

  const idSet = new Set(expectedIds)
  return results
    .filter((r): r is AiJudgeBlankResult => {
      if (!r || typeof r !== 'object') return false
      const x = r as Record<string, unknown>
      return (
        typeof x.blankId === 'string' &&
        typeof x.correct === 'boolean' &&
        typeof x.standardAnswer === 'string' &&
        typeof x.reason === 'string'
      )
    })
    .filter((r) => idSet.has(r.blankId))
}

/** 调用 AI 接口对填空结果进行语义判断 */
export async function judgeBlanks(
  settings: AppSettings,
  req: AiJudgeRequest,
  opts?: AiCallOptions,
): Promise<AiJudgeResponse> {
  const { provider, model, config } = resolveAiCall(settings, opts)
  const url = buildChatUrl(provider)
  const basePayload =
    provider.apiFormat === 'responses'
      ? buildResponsesJudgePayload(req, model)
      : buildOpenAiJudgePayload(req, model)
  const payload = applyModelConfig(provider, model, basePayload, config)

  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(provider),
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new AiResponseError(`AI 接口返回 ${res.status}: ${text.slice(0, 200)}`)
  }

  const data = await res.json()
  const content =
    provider.apiFormat === 'responses'
      ? extractResponsesContent(data)
      : extractOpenAiContent(data)
  const results = parseResults(content, req.blanks.map((b) => b.id))

  // 补齐缺失的 blankId（按用户答案是否与标准答案一致兜底）
  const got = new Map(results.map((r) => [r.blankId, r]))
  const finalResults: AiJudgeBlankResult[] = req.blanks.map((b) => {
    const r = got.get(b.id)
    if (r) return r
    return {
      blankId: b.id,
      correct: b.userAnswer.trim() === b.standardAnswer.trim(),
      standardAnswer: b.standardAnswer,
      reason: 'AI 未返回该项，按字面一致兜底判断',
    }
  })

  return { results: finalResults }
}

/**
 * 将 ModelConfig（思考等级 + 自定义参数）合并到 payload
 * - 思考等级：通过 buildThinkingParams 转换为对应字段
 * - 自定义参数：浅合并到 payload 顶层（覆盖现有同名字段）
 */
export function applyModelConfig(
  provider: AiProvider,
  model: string,
  basePayload: unknown,
  config: ModelConfig,
): Record<string, unknown> {
  const base = (basePayload ?? {}) as Record<string, unknown>
  const thinking = buildThinkingParams(provider, model, config.thinkingLevel)
  const custom = config.customParams ?? {}
  return { ...base, ...thinking, ...custom }
}

/** 构造聊天/响应接口 URL */
export function buildChatUrl(provider: AiProvider): string {
  const base = provider.baseUrl.replace(/\/$/, '')
  if (provider.apiFormat === 'responses') {
    return base.endsWith('/responses') ? base : `${base}/responses`
  }
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`
}

/** 构造请求头（含鉴权） */
export function buildHeaders(provider: AiProvider): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${provider.apiKey}`,
  }
}

/**
 * 获取可用模型列表（OpenAI 兼容 /models 接口）
 * @param provider 供应商配置
 * @returns 模型 id 字符串数组
 */
export async function fetchAvailableModels(provider: AiProvider): Promise<string[]> {
  if (provider.baseUrl.trim().length === 0 || provider.apiKey.trim().length === 0) {
    throw new AiConfigError(
      `供应商「${provider.name}」缺少 baseUrl 或 apiKey`,
    )
  }

  const base = provider.baseUrl.replace(/\/$/, '')
  const url = base.endsWith('/models') ? base : `${base}/models`

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new AiResponseError(`获取模型列表失败 ${res.status}: ${text.slice(0, 200)}`)
  }

  const data = await res.json()
  const arr = (data as { data?: Array<{ id?: string }> }).data
  if (!Array.isArray(arr)) return []
  return arr
    .map((m) => m.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
}

/**
 * 解析 SSE（Server-Sent Events）流，提取文本增量并回调，返回完整文本
 * - OpenAI 兼容：data: {"choices":[{"delta":{"content":"..."}}]}
 * - Responses API：data: {"type":"response.output_text.delta","delta":"..."}
 * - 部分服务端不支持流式（或忽略 stream 参数）时直接返回非流式 JSON，
 *   此时兜底从完整响应中提取 content，保证结果可用（仅失去实时性）
 */
export async function readSseStream(
  res: Response,
  format: AiApiFormat,
  onDelta: (chunk: string) => void,
): Promise<string> {
  if (!res.body) {
    throw new AiResponseError('AI 接口未返回流式响应')
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let raw = ''
  let full = ''

  const consume = (chunk: string) => {
    if (!chunk) return
    full += chunk
    onDelta(chunk)
  }

  const extractDelta = (obj: Record<string, unknown>): string => {
    if (format === 'responses') {
      if (
        obj.type === 'response.output_text.delta' &&
        typeof obj.delta === 'string'
      ) {
        return obj.delta
      }
      return ''
    }
    // OpenAI 兼容：优先 delta.content（流式增量），兼容 message.content（chunk 合并）
    const choice = (obj as { choices?: Array<unknown> }).choices?.[0]
    if (!choice || typeof choice !== 'object') return ''
    const c = choice as {
      delta?: { content?: string }
      message?: { content?: string }
    }
    return typeof c.delta?.content === 'string'
      ? c.delta.content
      : typeof c.message?.content === 'string'
        ? c.message.content
        : ''
  }

  const parseLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return
    const data = trimmed.slice(5).trim()
    if (data === '[DONE]') return
    try {
      consume(extractDelta(JSON.parse(data) as Record<string, unknown>))
    } catch {
      // 忽略无法解析的行
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const text = decoder.decode(value, { stream: true })
    raw += text
    buffer += text
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) parseLine(line)
  }
  // 处理末尾残留在 buffer 中、没有换行结尾的数据行
  if (buffer.trim()) parseLine(buffer)

  // 兜底：流式未解析出任何内容时，尝试把完整响应当作非流式 JSON 解析
  if (full === '' && raw.trim()) {
    let jsonText = raw.trim()
    // 若整体是 SSE 格式（data: 前缀 + 空行），剥离后取第一个 JSON 对象
    const dataMatch = jsonText.match(/^data:\s*(\{[\s\S]*?\})\s*$/)
    if (dataMatch) jsonText = dataMatch[1]
    try {
      const obj = JSON.parse(jsonText) as Record<string, unknown>
      if (format === 'responses') {
        const outputText = (obj as { output_text?: string }).output_text
        if (typeof outputText === 'string' && outputText) return outputText
      } else {
        const choice = (obj as { choices?: Array<unknown> }).choices?.[0]
        if (choice && typeof choice === 'object') {
          const content = (choice as { message?: { content?: string } }).message
            ?.content
          if (typeof content === 'string' && content) return content
        }
      }
    } catch {
      // 兜底失败时返回已累积内容（可能为空）
    }
  }
  return full
}

/** 兼容旧调用签名：从 settings 中取默认供应商再获取模型列表 */
export async function fetchAvailableModelsFromSettings(
  settings: AppSettings,
): Promise<string[]> {
  const provider = getDefaultProvider(settings)
  if (!provider) {
    throw new AiConfigError('AI 供应商未配置，请先到设置页添加供应商')
  }
  return fetchAvailableModels(provider)
}

/**
 * 拉取某供应商的模型列表并返回更新了 models 字段的新供应商对象
 * 失败时返回原供应商对象（不修改）
 */
export async function refreshProviderModels(
  provider: AiProvider,
): Promise<{ provider: AiProvider; error: string | null }> {
  try {
    if (provider.baseUrl.trim().length === 0 || provider.apiKey.trim().length === 0) {
      return { provider, error: '缺少 baseUrl 或 apiKey' }
    }
    const models = await fetchAvailableModels(provider)
    return { provider: { ...provider, models }, error: null }
  } catch (e) {
    return {
      provider,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

/**
 * 从多个供应商并行获取模型列表，按供应商分组返回
 * 失败的供应商会被记录在 errors 中但不阻塞其它供应商
 */
export async function fetchModelsGroupedByProvider(
  providers: AiProvider[],
): Promise<{ groups: { provider: AiProvider; models: string[] }[]; errors: { provider: AiProvider; error: string }[] }> {
  const results = await Promise.all(
    providers.map(async (p) => {
      try {
        if (p.baseUrl.trim().length === 0 || p.apiKey.trim().length === 0) {
          return { provider: p, models: [] as string[], error: '缺少 baseUrl 或 apiKey' }
        }
        const models = await fetchAvailableModels(p)
        return { provider: p, models, error: null as string | null }
      } catch (e) {
        return { provider: p, models: [] as string[], error: e instanceof Error ? e.message : String(e) }
      }
    }),
  )
  const groups = results
    .filter((r) => r.models.length > 0)
    .map((r) => ({ provider: r.provider, models: r.models }))
  const errors = results
    .filter((r) => r.error !== null && r.models.length === 0)
    .map((r) => ({ provider: r.provider, error: r.error! }))
  return { groups, errors }
}

/** 兼容：根据 API 格式从响应中抽取 content（供其它模块复用） */
export function extractContentByFormat(data: unknown, format: AiApiFormat): string {
  return format === 'responses' ? extractResponsesContent(data) : extractOpenAiContent(data)
}
