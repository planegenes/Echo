/**
 * 组句 / 翻译题通用工具
 * - 分词：按标记位置 + 标点/空白 切分
 * - 比对：忽略标点与大小写
 */

/** 标点与空白（Unicode 标点类 + 空白） */
const PUNCT_RE = /[\p{P}\s]/u

/** 判断单个字符是否为标点或空白 */
export function isPunctOrSpace(ch: string): boolean {
  if (!ch) return false
  return PUNCT_RE.test(ch)
}

/** 去除标点与空白，返回纯净字符串（按 Unicode 码点） */
export function stripPunctuation(s: string): string {
  return Array.from(s)
    .filter((ch) => !isPunctOrSpace(ch))
    .join('')
}

/**
 * 比较两个字符串是否一致（忽略标点、空白与大小写）
 * 用于组句题与翻译题的字面比对
 */
export function compareIgnorePunctuation(a: string, b: string): boolean {
  return (
    stripPunctuation(a).toLowerCase() === stripPunctuation(b).toLowerCase()
  )
}

/**
 * 按标记位置与标点对答案进行分词
 * @param answer 标准答案
 * @param marks 标记的间隙位置集合（0..N，N=字符数；位置 g 表示在第 g 个字符之前切分）
 * @returns 单词数组（已过滤空串与纯标点）
 */
export function splitSentence(answer: string, marks: number[]): string[] {
  const chars = Array.from(answer)
  const N = chars.length
  const splitGaps = new Set<number>(marks)
  const drop = new Set<number>()

  // 标点字符作为切分点，并标记为丢弃
  for (let i = 0; i < N; i++) {
    if (isPunctOrSpace(chars[i])) {
      splitGaps.add(i) // 该字符之前的间隙
      splitGaps.add(i + 1) // 该字符之后的间隙
      drop.add(i)
    }
  }

  const words: string[] = []
  let current = ''
  for (let i = 0; i < N; i++) {
    if (drop.has(i)) {
      const trimmed = current.trim()
      if (trimmed) words.push(trimmed)
      current = ''
      continue
    }
    if (splitGaps.has(i) && current) {
      words.push(current.trim())
      current = ''
    }
    current += chars[i]
  }
  const last = current.trim()
  if (last) words.push(last)

  return words.filter((w) => w.length > 0)
}

/**
 * 将答案字符串按 Unicode 码点展开为字符数组（用于字符级渲染）
 */
export function toChars(answer: string): string[] {
  return Array.from(answer)
}
