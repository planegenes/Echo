import { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import type { Content } from '@/types'
import { cn } from '@/lib/utils'
import { escapeHtml, renderRubyToHtml } from '@/lib/ruby'

export interface ContentRendererProps {
  content: Content
  className?: string
  /** latex 解析失败时是否降级显示原文（默认 true） */
  fallbackOnFailure?: boolean
}

/**
 * 渲染 text / latex / ruby 三种格式
 * - text: 直接显示字符串
 * - latex: 通过 KaTeX 渲染（throwOnError: false）
 * - ruby: 解析 `{base}^{ruby}` 语法，输出 `<ruby>base<rt>ruby</rt></ruby>`
 */
export function ContentRenderer({
  content,
  className,
  fallbackOnFailure = true,
}: ContentRendererProps) {
  const html = useMemo(() => {
    if (content.format === 'latex') {
      try {
        return katex.renderToString(content.value, {
          throwOnError: false,
          displayMode: false,
          output: 'html',
        })
      } catch {
        return fallbackOnFailure
          ? escapeHtml(content.value)
          : `<span class="text-destructive">LaTeX 渲染失败</span>`
      }
    }
    if (content.format === 'ruby') {
      return renderRubyToHtml(content.value)
    }
    return escapeHtml(content.value)
  }, [content, fallbackOnFailure])

  return (
    <span
      className={cn(
        content.format === 'latex' ? 'katex-inline' : '',
        content.format === 'ruby' ? 'ruby-inline' : '',
        className,
      )}
      // KaTeX 输出受信任的 HTML（renderToString 已转义源字符串）
      // Ruby 输出受信任的 HTML（escapeHtml 已转义源字符串）
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
