import type {
  AiJudgeBlankResult,
  AiJudgeRequest,
  AiJudgeResponse,
  AppSettings,
} from '@/types'

/**
 * AI 评判客户端
 * 详见 spec 5.5：填空模式调用 AI 接口进行语义判断
 * 接口配置保存在 settings，不上传服务器
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

/** 检查 AI 接口是否已配置可用 */
export function isAiConfigured(settings: Pick<AppSettings, 'aiEndpoint' | 'aiApiKey'>): boolean {
  return settings.aiEndpoint.trim().length > 0 && settings.aiApiKey.trim().length > 0
}

/** 构造 OpenAI 兼容风格的 messages payload */
function buildPayload(req: AiJudgeRequest): unknown {
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
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0,
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
): Promise<AiJudgeResponse> {
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
    body: JSON.stringify(buildPayload(req)),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new AiResponseError(`AI 接口返回 ${res.status}: ${text.slice(0, 200)}`)
  }

  const data = await res.json()
  const content = extractContent(data)
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
