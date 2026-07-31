/**
 * 全局类型定义
 * 详见 spec 第 3 节数据模型
 */

// ===== 配对测验 =====

export type ContentFormat = 'text' | 'latex'

export interface Content {
  format: ContentFormat
  value: string
}

export interface PairStats {
  /** 根据 left 选 right 的累计错误权重 */
  lr: number
  /** 根据 right 选 left 的累计错误权重 */
  rl: number
}

export interface PairItem {
  id: string
  left: Content
  right: Content
  stats: PairStats
}

// ===== 填空检测 =====

export interface TextItem {
  id: string
  content: string
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

// ===== 设置 =====

export interface AppSettings {
  soundEnabled: boolean
  darkMode: boolean
  aiEndpoint: string
  aiApiKey: string
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
  pairs: PairItem[]
  texts: TextItem[]
}
