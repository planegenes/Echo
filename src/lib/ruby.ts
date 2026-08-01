/**
 * 注音（Ruby）解析器
 *
 * 输入语法（spec）：`{base}^{ruby}`
 *   - 多字符 base/ruby 必须用 `{}` 包裹
 *   - 单字符 base/ruby 可省略 `{}`
 *   - `^` 是 base 与 ruby 之间的分隔符（不可省略）
 *
 * 示例：
 *   東^とう           → 東 + とう
 *   {東京}^{とうきょう}  → 東京 + とうきょう
 *   東^{とうほう}        → 東 + とうほう（单字符 base）
 *   {東方}^とう          → 東方 + とう（单字符 ruby）
 *   漢^かん字^じ          → 两段 ruby（漢+かん, 字+じ）
 *
 * 不匹配 `^` 分隔的字符视为普通文本段。
 */

/** 一段 ruby 注音 */
export interface RubySegment {
  base: string
  ruby: string
}

/** 一段普通文本 */
export interface TextSegment {
  text: string
}

export type ParsedRuby = RubySegment | TextSegment

/**
 * 解析 ruby 字符串为段落数组
 *
 * 正则匹配四种组合：
 *   1. {base}^{ruby}    多字符 base + 多字符 ruby
 *   2. {base}^r         多字符 base + 单字符 ruby
 *   3. b^{ruby}         单字符 base + 多字符 ruby
 *   4. b^r              单字符 base + 单字符 ruby
 *
 * 单字符位置使用 `[^{}^]` 排除 `{`、`}`、`^`，避免吞掉下一组的起始符。
 * 多字符位置使用 `[^{}]+` 允许任意非花括号字符（含 `^`）。
 */
const RUBY_RE =
  /(?:\{([^{}]+)\}|([^{}^]))\^(?:\{([^{}]+)\}|([^{}^]))/g

export function parseRuby(value: string): ParsedRuby[] {
  if (!value) return []
  const segments: ParsedRuby[] = []
  let lastIdx = 0
  let match: RegExpExecArray | null

  RUBY_RE.lastIndex = 0
  while ((match = RUBY_RE.exec(value)) !== null) {
    if (match.index > lastIdx) {
      segments.push({ text: value.slice(lastIdx, match.index) })
    }
    const base = match[1] ?? match[2] ?? ''
    const ruby = match[3] ?? match[4] ?? ''
    if (base && ruby) {
      segments.push({ base, ruby })
    }
    lastIdx = RUBY_RE.lastIndex
  }

  if (lastIdx < value.length) {
    segments.push({ text: value.slice(lastIdx) })
  }

  return segments
}

/** 转义 HTML 特殊字符 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * 将 ruby 字符串渲染为 HTML 字符串
 *
 * 输出形如：`<ruby>東<rt>とう</rt></ruby>`
 * 普通文本段会被 HTML 转义后原样输出。
 */
export function renderRubyToHtml(value: string): string {
  const segments = parseRuby(value)
  return segments
    .map((seg) => {
      if ('base' in seg && 'ruby' in seg) {
        return (
          `<ruby>${escapeHtml(seg.base)}<rt>${escapeHtml(seg.ruby)}</rt></ruby>`
        )
      }
      return escapeHtml(seg.text)
    })
    .join('')
}
