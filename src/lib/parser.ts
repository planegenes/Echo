import type { ParsedBlank, ParsedText, TextItem, TextSegment } from '@/types'
import { randInt, uid } from './utils'

/**
 * 文本解析器
 * 规则（spec 5.3）：
 *   `**内容**` → 加粗段，不提取为空白
 *   `*内容*`   → 空白段，提取 answer、length
 *   长度按 Unicode 码点计算（Array.from）
 *   maxBlankLength = 所有空白长度的最大值
 *   显示宽度 = maxBlankLength + randInt(3,6) 个全角空格
 */
const TOKEN_RE = /\*\*(.+?)\*\*|\*(.+?)\*/g

/** 解析单段文本为 segments + blanks */
export function parseText(content: string): ParsedText {
  const segments: TextSegment[] = []
  const blanks: ParsedBlank[] = []
  let maxBlankLength = 0
  let lastIdx = 0
  let match: RegExpExecArray | null
  TOKEN_RE.lastIndex = 0

  while ((match = TOKEN_RE.exec(content)) !== null) {
    const idx = match.index
    if (idx > lastIdx) {
      segments.push({ type: 'text', value: content.slice(lastIdx, idx) })
    }

    if (match[1] !== undefined) {
      // 加粗段
      segments.push({ type: 'bold', value: match[1] })
    } else if (match[2] !== undefined) {
      // 空白段
      const answer = match[2]
      const length = Array.from(answer).length
      const id = uid('blank')
      const blank: ParsedBlank = { id, answer, length }
      blanks.push(blank)
      maxBlankLength = Math.max(maxBlankLength, length)
      segments.push({ type: 'blank', id, answer, length })
    }

    lastIdx = idx + match[0].length
  }

  if (lastIdx < content.length) {
    segments.push({ type: 'text', value: content.slice(lastIdx) })
  }

  return { segments, blanks, maxBlankLength }
}

/** 根据最大空白长度生成全角空格填充串（用于撑开空白槽宽度） */
export function buildBlankPad(maxBlankLength: number): string {
  const width = maxBlankLength + randInt(3, 6)
  return '\u3000'.repeat(Math.max(2, width))
}

/** 收集多段文本里所有空白的答案（去重） */
export function collectAllBlankAnswers(texts: TextItem[]): string[] {
  const set = new Set<string>()
  for (const t of texts) {
    const { blanks } = parseText(t.content)
    for (const b of blanks) set.add(b.answer)
  }
  return Array.from(set)
}

/** 判断文本是否包含空白 */
export function hasBlank(content: string): boolean {
  TOKEN_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TOKEN_RE.exec(content)) !== null) {
    if (m[2] !== undefined) return true
  }
  return false
}

/** 统计空白数 */
export function countBlanks(content: string): number {
  return parseText(content).blanks.length
}
