import type { PointsState } from '@/store/points'
import type { DailyStreakState, DayLogs } from '@/lib/dailyStreak'

/**
 * 全局类型定义
 * 详见 spec 第 3 节数据模型
 */

// ===== 配对测验 =====

export type ContentFormat = 'text' | 'latex' | 'ruby'

export interface Content {
  format: ContentFormat
  value: string
}

export interface PairStats {
  /** 根据 left 选 right 的累计错误权重 */
  lr: number
  /** 根据 right 选 left 的累计错误权重 */
  rl: number
  /** 熟练度权重（0~100，默认 50）：答对 +1，答错 -2，越高越熟练、出题频率越低 */
  w?: number
}

export interface PairItem {
  id: string
  /** 左侧内容（多项，组内任意一项与右侧任意一项都匹配） */
  left: Content[]
  /** 右侧内容（多项，组内任意一项与左侧任意一项都匹配） */
  right: Content[]
  stats: PairStats
  /** 题目级 AI 模型覆盖（为空则使用 settings.defaultAiModel） */
  aiModel?: string
}

// ===== 填空检测 =====

export interface TextItem {
  id: string
  content: string
  /** 题目级 AI 模型覆盖（为空则使用 settings.defaultAiModel） */
  aiModel?: string
}

export interface ParsedBlank {
  id: string
  answer: string
  length: number
}

export type TextSegment =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'blank'; id: string; answer: string; length: number }

export interface ParsedText {
  segments: TextSegment[]
  blanks: ParsedBlank[]
  /** 所有空白内容字符数的最大值 */
  maxBlankLength: number
}

// ===== 组句 / 翻译 =====

/**
 * 组句题数据
 * - answer: 标准答案句子
 * - hint: 提示文本
 * - words: 由答案分词得到的单词数组（可能有重复项），用于组句作答
 */
export interface SentenceItem {
  id: string
  answer: string
  hint: string
  words: string[]
  /** 题目级 AI 模型覆盖（为空则使用 settings.defaultAiModel） */
  aiModel?: string
}

// ===== 专题 =====

export type TopicType = 'pairs' | 'texts' | 'sentences'

export interface Topic {
  id: string
  name: string
  type: TopicType
  pairs: PairItem[]
  texts: TextItem[]
  sentences: SentenceItem[]
}

// ===== 组句 / 翻译 会话状态 =====

/** 组句题选项（含正确项与干扰项） */
export interface AssemblyOption {
  id: string
  value: string
  used: boolean
}

/** 组句题会话 */
export interface AssemblySession {
  sentenceId: string
  /** 选项池：正确单词 + 干扰项，已打乱 */
  options: AssemblyOption[]
  /** 中间作答区已放置的选项 id 序列（按顺序） */
  placed: string[]
  confirmed: boolean
}

/** 翻译题会话 */
export interface TranslateSession {
  sentenceId: string
  /** 用户输入 */
  input: string
  confirmed: boolean
}

/** 翻译题结果 */
export interface TranslateResult {
  correct: boolean
  /** 字符串比对是否一致（忽略标点） */
  exactMatch: boolean
  /** AI 判题理由（仅 AI 判题时） */
  reason?: string
}

// ===== 设置 =====

/** AI 接口协议格式 */
export type AiApiFormat = 'openai' | 'responses'
// 'openai'    = OpenAI 兼容 /chat/completions 接口（默认）
// 'responses' = OpenAI Responses API /responses 接口

/** 思考等级（参考 Rikkahub 风格） */
export type ThinkingLevel = 'off' | 'low' | 'medium' | 'high'

/** 单个模型的配置（思考等级 + 自定义参数） */
export interface ModelConfig {
  /** 思考等级，off 表示不开启推理 */
  thinkingLevel: ThinkingLevel
  /** 自定义参数（JSON 对象，会合并到请求 payload 顶层） */
  customParams?: Record<string, unknown>
}

/** AI 供应商配置 */
export interface AiProvider {
  id: string
  /** 显示名称 */
  name: string
  /** 预设供应商 id（如 'openai'、'deepseek'），自定义供应商为 null */
  presetId: string | null
  /** API 协议格式 */
  apiFormat: AiApiFormat
  /** Base URL，例如 https://api.openai.com/v1 */
  baseUrl: string
  /** API Key */
  apiKey: string
  /** 已缓存的模型 id 列表（从 /models 接口获取，可在设置页刷新） */
  models: string[]
  /** 模型级配置，按 modelId 索引 */
  modelConfigs: Record<string, ModelConfig>
}

export interface AppSettings {
  soundEnabled: boolean
  darkMode: boolean
  /** @deprecated 旧字段，迁移到 aiProviders + defaultAiProviderId */
  aiEndpoint: string
  /** @deprecated 旧字段，迁移到 aiProviders[].apiKey */
  aiApiKey: string
  /** @deprecated 旧字段，迁移到 defaultAiModel */
  aiModel: string
  /** AI 供应商列表 */
  aiProviders: AiProvider[]
  /** 默认供应商 id（用于默认模型 + 无题目级覆盖时的兜底） */
  defaultAiProviderId: string | null
  /** 默认 AI 模型名 */
  defaultAiModel: string
  /** WebDAV 同步配置 */
  webdavUrl: string
  webdavUsername: string
  webdavPassword: string
}

// ===== 测验会话状态 =====

/** 模式一：单选匹配方向 */
export type ChoiceDirection = 'askLeft' | 'askRight'

/** 模式二：填空结果条目 */
export interface FillBlankResult {
  blankId: string
  userAnswer: string
  correctAnswer: string
  correct: boolean
  /** AI 评判给出的理由（仅填空模式） */
  reason?: string
}

// ===== AI 接口契约 =====

export interface AiJudgeRequest {
  text: string
  blanks: Array<{
    id: string
    userAnswer: string
    standardAnswer: string
  }>
}

export interface AiJudgeBlankResult {
  blankId: string
  correct: boolean
  standardAnswer: string
  reason: string
}

export interface AiJudgeResponse {
  results: AiJudgeBlankResult[]
}

// ===== 导入/导出 =====

export interface Snapshot {
  topics: Topic[]
  /** 积分与连续答对（WebDAV 同步用，可选） */
  points?: PointsState
  /** 每日进度标量（WebDAV 同步用，可选） */
  dailyStreak?: DailyStreakState
  /** 每日打卡日志（WebDAV 同步用，可选） */
  dayLogs?: DayLogs
  /** 快照最后更新时间戳（last-write-wins 同步用） */
  updatedAt?: number
}
