import { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import type { Content } from '@/types'
import { cn } from '@/lib/utils'

export interface ContentRendererProps {
  content: Content
  className?: string
  /** latex 解析失败时是否降级显示原文（默认 true） */
  fallbackOnFailure?: boolean
}

/**
 * 渲染 text / latex / bold 三种格式
 * - text: 直接显示字符串
 * - latex: 通过 KaTeX 渲染（throwOnError: false）
 * - bold: 由调用方包裹 strong 标签，本组件只在 latex/text 层处理
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
    return escapeHtml(content.value)
  }, [content, fallbackOnFailure])

  return (
    <span
      className={cn(content.format === 'latex' ? 'katex-inline' : '', className)}
      // KaTeX 输出受信任的 HTML（renderToString 已转义源字符串）
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
