import type { AppSettings } from '@/types'
import { AiConfigError, AiResponseError, isAiConfigured, type AiCallOptions } from './ai'
import {
  buildCustomPayload,
  callChat,
  parseJsonObject,
  type ChatMessage,
} from './ai-generate'
import { isPunctOrSpace, stripPunctuation } from './sentence'

/**
 * 组句 / 翻译题 AI 能力
 * - segmentSentence: AI 对答案进行分词
 * - judgeTranslation: AI 判断翻译答案语义是否一致
 * 复用 ai-generate.ts 的 callChat 与错误类型
 * 支持题目级模型覆盖（opts.modelOverride）
 */

/** AI 分词：将答案切分为单词数组 */
export async function segmentSentence(
  settings: AppSettings,
  answer: string,
  opts?: AiCallOptions,
): Promise<string[]> {
  if (!isAiConfigured(settings)) {
    throw new AiConfigError('AI 接口未配置，请先到设置页添加供应商')
  }

  const system =
    '你是一个分词助手，负责将句子切分为可重新排列的单词/词组单元。' +
    '保留有意义的词组，丢弃标点符号。只返回 JSON，结构为 {"words":["单词1","单词2"]}。' +
    'words 必须是字符串数组，按原句顺序排列，拼接后应能还原原句（忽略标点）。' +
    '原句可能包含注音（Ruby）标记：base 与读音 ruby 都用花括号包裹并以 ^ 分隔，如 {排}^{paai}、{排骨}^{paai gwat}。' +
    '注音应尽量按单个汉字逐字标注（如 排^{paai}骨^{gwat}），仅当词的整体读音无法逐字拆分时（如日语 {今日}^{きょう}）才用整体注音。' +
    '注音标记整体是一个不可拆分的词单元，分词时不要把 base 与 ruby 拆开，如 排^{paai}骨^{gwat} 应原样作为一个 word 返回。'

  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: `请对以下句子分词：\n${answer}\n\n严格按 JSON 结构返回。` },
  ]

  const content = await callChat(
    settings,
    buildCustomPayload(messages, opts?.modelOverride ?? settings.defaultAiModel, 0),
    opts,
  )
  const obj = parseJsonObject(content)
  const words = obj.words
  if (!Array.isArray(words)) {
    throw new AiResponseError('AI 返回缺少 words 数组')
  }
  return words
    .filter((w): w is string => typeof w === 'string')
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && !isPurePunct(w))
}

/** 判断字符串是否纯标点/空白 */
function isPurePunct(s: string): boolean {
  return Array.from(s).every((ch) => isPunctOrSpace(ch))
}

/** AI 翻译判题结果 */
export interface TranslationJudgeResult {
  correct: boolean
  reason: string
}

/**
 * AI 翻译判题：判断用户答案与标准答案语义是否一致
 * 调用前应先做字面比对（忽略标点），一致则无需调用 AI
 */
export async function judgeTranslation(
  settings: AppSettings,
  answer: string,
  userAnswer: string,
  hint: string,
  opts?: AiCallOptions,
): Promise<TranslationJudgeResult> {
  if (!isAiConfigured(settings)) {
    throw new AiConfigError('AI 接口未配置，请先到设置页添加供应商')
  }

  const system =
    '你是一个语言学习助手，负责判断用户的翻译/组句答案是否与标准答案语义一致。' +
    '允许语序差异、同义词、大小写、标点差异视为正确；但核心含义必须一致。' +
    '标准答案可能包含注音（Ruby）标记：base 与读音 ruby 都用花括号包裹并以 ^ 分隔，如 {東}^{と}、{東京}^{とうきょう}。' +
    '注音仅是读音提示，不影响语义：判断时请忽略注音标记，只比较 base 部分的实际含义。' +
    '只返回 JSON，结构为 {"correct":boolean,"reason":"简短理由"}。'

  const user =
    `提示：${hint}\n` +
    `标准答案：${answer}\n` +
    `用户答案：${userAnswer}\n\n` +
    `请判断用户答案是否与标准答案语义一致，严格按 JSON 结构返回。`

  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]

  const content = await callChat(
    settings,
    buildCustomPayload(messages, opts?.modelOverride ?? settings.defaultAiModel, 0),
    opts,
  )
  const obj = parseJsonObject(content)
  const correct = obj.correct
  const reason = obj.reason
  if (typeof correct !== 'boolean' || typeof reason !== 'string') {
    throw new AiResponseError('AI 返回结构不正确')
  }
  return { correct, reason }
}

/**
 * 翻译题判题（字面优先，AI 兜底）
 * - 先忽略标点比对，一致则通过
 * - 不一致则调用 AI 判断
 */
export async function judgeTranslationWithFallback(
  settings: AppSettings,
  answer: string,
  userAnswer: string,
  hint: string,
  opts?: AiCallOptions,
): Promise<{ correct: boolean; exactMatch: boolean; reason?: string }> {
  const exactMatch =
    stripPunctuation(answer).toLowerCase() ===
    stripPunctuation(userAnswer).toLowerCase()
  if (exactMatch) {
    return { correct: true, exactMatch: true }
  }
  const ai = await judgeTranslation(settings, answer, userAnswer, hint, opts)
  return { correct: ai.correct, exactMatch: false, reason: ai.reason }
}
