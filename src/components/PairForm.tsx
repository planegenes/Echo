import { useEffect, useState } from 'react'
import type { Content, ContentFormat, PairItem } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ContentRenderer } from '@/components/ContentRenderer'
import { uid } from '@/lib/utils'

export interface PairFormProps {
  initial?: PairItem | null
  onSubmit: (pair: PairItem) => void | Promise<void>
  onCancel: () => void
}

const EMPTY: PairItem = {
  id: '',
  left: { format: 'text', value: '' },
  right: { format: 'text', value: '' },
  stats: { lr: 0, rl: 0 },
}

/**
 * 新增/编辑 pair 表单
 */
export function PairForm({ initial, onSubmit, onCancel }: PairFormProps) {
  const [pair, setPair] = useState<PairItem>(initial ?? EMPTY)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setPair(initial ?? EMPTY)
  }, [initial])

  const update = (side: 'left' | 'right', patch: Partial<Content>) => {
    setPair((p) => ({
      ...p,
      [side]: { ...p[side], ...patch } as Content,
    }))
  }

  const canSubmit =
    pair.left.value.trim().length > 0 && pair.right.value.trim().length > 0

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      await onSubmit({
        ...pair,
        id: pair.id || uid('pair'),
        stats: pair.stats ?? { lr: 0, rl: 0 },
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <SideEditor
          label="左侧"
          content={pair.left}
          onChange={(patch) => update('left', patch)}
        />
        <SideEditor
          label="右侧"
          content={pair.right}
          onChange={(patch) => update('right', patch)}
        />
      </div>

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

interface SideEditorProps {
  label: string
  content: Content
  onChange: (patch: Partial<Content>) => void
}

function SideEditor({ label, content, onChange }: SideEditorProps) {
  const isLatex = content.format === 'latex'
  const isRuby = content.format === 'ruby'
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <div className="flex items-center gap-1 text-xs">
          <FormatToggle
            value={content.format}
            onChange={(fmt) => onChange({ format: fmt })}
          />
        </div>
      </div>
      {isLatex ? (
        <Textarea
          value={content.value}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder="输入 LaTeX，例如 a^2 + b^2 = c^2"
          rows={2}
        />
      ) : isRuby ? (
        <Textarea
          value={content.value}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder="输入注音，例如 東^と 或 {東京}^{とうきょう}（多字符需加 {}）"
          rows={2}
        />
      ) : (
        <Input
          value={content.value}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder="输入文本"
        />
      )}
      <div className="rounded-md bg-muted/40 px-2 py-1.5 text-center text-sm min-h-[2rem] flex items-center justify-center">
        {content.value ? (
          <ContentRenderer content={content} />
        ) : (
          <span className="text-xs text-muted-foreground">预览</span>
        )}
      </div>
    </div>
  )
}

function FormatToggle({
  value,
  onChange,
}: {
  value: ContentFormat
  onChange: (fmt: ContentFormat) => void
}) {
  const labels: Record<ContentFormat, string> = {
    text: '文本',
    latex: 'LaTeX',
    ruby: '注音',
  }
  return (
    <div className="inline-flex rounded-md border bg-background p-0.5">
      {(['text', 'latex', 'ruby'] as const).map((fmt) => (
        <button
          key={fmt}
          type="button"
          onClick={() => onChange(fmt)}
          className={
            'rounded px-2 py-0.5 text-xs transition-colors ' +
            (value === fmt
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground')
          }
        >
          {labels[fmt]}
        </button>
      ))}
    </div>
  )
}
