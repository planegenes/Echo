import * as React from 'react'
import type { ParsedText, TextSegment } from '@/types'
import { cn } from '@/lib/utils'

export interface TextRendererProps {
  parsed: ParsedText
  /** 渲染空白槽的回调，返回 ReactNode */
  renderBlank?: (segment: Extract<TextSegment, { type: 'blank' }>) => React.ReactNode
  className?: string
}

/**
 * 渲染解析后的文本，分发：普通文本 / 加粗 / 空白槽
 * 空白槽的渲染由 renderBlank 决定（选词模式传入 BlankSlot，填空模式传入 BlankInput）
 */
export function TextRenderer({ parsed, renderBlank, className }: TextRendererProps) {
  return (
    <p
      className={cn('leading-loose whitespace-pre-wrap break-words', className)}
    >
      {parsed.segments.map((seg, i) => {
        if (seg.type === 'text') return <React.Fragment key={i}>{seg.value}</React.Fragment>
        if (seg.type === 'bold')
          return (
            <strong key={i} className="font-semibold">
              {seg.value}
            </strong>
          )
        // blank
        return <React.Fragment key={seg.id}>{renderBlank?.(seg)}</React.Fragment>
      })}
    </p>
  )
}
