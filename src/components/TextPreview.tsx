import { useMemo } from 'react'
import { TextRenderer } from 找不到模块“@/lib/parser”或其相应的类型声明。
import { parseText } from '@/lib/parser'
import { cn } from '@/lib/utils'

export interface TextPreviewProps {
  content: string
  className?: string
}

/**
 * 文本预览（测验用）
 * - 加粗正常渲染（<strong>）
 * - 空白处显示下划线占位符，不显示答案
 * 用于 FillSelectPage / FillInputPage / ManageTextsPage 的原文展示部分
 */
export function TextPreview({ content, className }: TextPreviewProps) {
  const parsed = useMemo(() => parseText(content), [content])
  return (
    <TextRenderer
      parsed={parsed}
      className={cn('text-sm', className)}
      renderBlank={(seg) => (
        <span
          className="mx-0.5 inline-block border-b-2 border-current align-baseline"
          style={{ minWidth: `${Math.max(2, seg.length)}em` }}
          aria-label="空白"
        />
      )}
    />
  )
}
