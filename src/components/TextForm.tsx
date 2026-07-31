import { useEffect, useMemo, useState } from 'react'
import type { TextItem } from '@/types'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { parseText } from '@/lib/parser'
import { uid } from '@/lib/utils'

export interface TextFormProps {
  initial?: TextItem | null
  onSubmit: (text: TextItem) => void | Promise<void>
  onCancel: () => void
}

/**
 * 文本编辑表单
 * - 实时显示空白识别数量与解析预览
 */
export function TextForm({ initial, onSubmit, onCancel }: TextFormProps) {
  const [content, setContent] = useState(initial?.content ?? '')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setContent(initial?.content ?? '')
  }, [initial])

  const parsed = useMemo(() => parseText(content), [content])
  const blankCount = parsed.blanks.length

  const canSubmit = content.trim().length > 0

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      await onSubmit({
        id: initial?.id ?? uid('text'),
        content,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>文本内容</Label>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={8}
          placeholder={`使用 **加粗** 显示加粗文本，*空白* 标记需要填空的内容。\n例如：中国的首都是*北京*。`}
        />
        <p className="text-xs text-muted-foreground">
          识别到 <span className="font-medium">{blankCount}</span> 个空白。
          使用 <code>*内容*</code> 标记空白；<code>**内容**</code> 标记加粗。
        </p>
      </div>

      {content && (
        <div className="rounded-md border bg-muted/20 p-3">
          <div className="mb-2 text-xs text-muted-foreground">解析预览</div>
          <div className="leading-loose whitespace-pre-wrap break-words text-sm">
            {parsed.segments.map((seg, i) => {
              if (seg.type === 'text') return <span key={i}>{seg.value}</span>
              if (seg.type === 'bold')
                return (
                  <strong key={i} className="font-semibold">
                    {seg.value}
                  </strong>
                )
              return (
                <span
                  key={seg.id}
                  className="mx-0.5 inline-block border-b-2 border-current px-1 text-primary"
                >
                  {seg.answer}
                </span>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={submitting}>
          取消
        </Button>
        <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
          保存
        </Button>
      </div>
    </div>
  )
}
