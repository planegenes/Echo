import { useEffect, useState } from 'react'
import type { Content, ContentFormat, PairItem } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ContentRenderer } from '@/components/ContentRenderer'
import { Plus, Trash2 } from 'lucide-react'
import { uid } from '@/lib/utils'

export interface PairFormProps {
  initial?: PairItem | null
  onSubmit: (pair: PairItem) => void | Promise<void>
  onCancel: () => void
}

function emptyContent(): Content {
  return { format: 'text', value: '' }
}

const EMPTY: PairItem = {
  id: '',
  left: [emptyContent()],
  right: [emptyContent()],
  stats: { lr: 0, rl: 0 },
}

/**
 * 新增/编辑 pair 表单（两侧为内容数组）
 */
export function PairForm({ initial, onSubmit, onCancel }: PairFormProps) {
  const [pair, setPair] = useState<PairItem>(initial ?? EMPTY)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => setPair(initial ?? EMPTY), [initial])

  const updateItem = (
    side: 'left' | 'right',
    index: number,
    patch: Partial<Content>,
  ) => {
    setPair((p) => ({
      ...p,
      [side]: p[side].map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }))
  }

  const addItem = (side: 'left' | 'right') => {
    setPair((p) => ({ ...p, [side]: [...p[side], emptyContent()] }))
  }

  const removeItem = (side: 'left' | 'right', index: number) => {
    setPair((p) => ({
      ...p,
      [side]:
        p[side].length > 1
          ? p[side].filter((_, i) => i !== index)
          : [emptyContent()],
    }))
  }

  const hasValue = (side: 'left' | 'right') =>
    pair[side].some((c) => c.value.trim().length > 0)
  const canSubmit = hasValue('left') && hasValue('right')

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      await onSubmit({
        ...pair,
        id: pair.id || uid('pair'),
        left: pair.left.filter((c) => c.value.trim().length > 0),
        right: pair.right.filter((c) => c.value.trim().length > 0),
        stats: pair.stats ?? { lr: 0, rl: 0 },
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <SideListEditor
          label="左侧"
          items={pair.left}
          onUpdate={(i, patch) => updateItem('left', i, patch)}
          onAdd={() => addItem('left')}
          onRemove={(i) => removeItem('left', i)}
        />
        <SideListEditor
          label="右侧"
          items={pair.right}
          onUpdate={(i, patch) => updateItem('right', i, patch)}
          onAdd={() => addItem('right')}
          onRemove={(i) => removeItem('right', i)}
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

interface SideListEditorProps {
  label: string
  items: Content[]
  onUpdate: (index: number, patch: Partial<Content>) => void
  onAdd: () => void
  onRemove: (index: number) => void
}

function SideListEditor({
  label,
  items,
  onUpdate,
  onAdd,
  onRemove,
}: SideListEditorProps) {
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Button type="button" variant="ghost" size="sm" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          添加
        </Button>
      </div>
      {items.map((content, index) => (
        <ContentItemEditor
          key={index}
          content={content}
          onChange={(patch) => onUpdate(index, patch)}
          onRemove={() => onRemove(index)}
          removable={items.length > 1}
        />
      ))}
    </div>
  )
}

interface ContentItemEditorProps {
  content: Content
  onChange: (patch: Partial<Content>) => void
  onRemove: () => void
  removable: boolean
}

function ContentItemEditor({
  content,
  onChange,
  onRemove,
  removable,
}: ContentItemEditorProps) {
  const isLatex = content.format === 'latex'
  const isRuby = content.format === 'ruby'
  return (
    <div className="space-y-1.5 rounded-md bg-muted/30 p-2">
      <div className="flex items-center justify-between">
        <FormatToggle
          value={content.format}
          onChange={(fmt) => onChange({ format: fmt })}
        />
        {removable && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            title="删除此项"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
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
          placeholder="输入注音，例如 東^と 或 {東京}^{とうきょう}"
          rows={2}
        />
      ) : (
        <Input
          value={content.value}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder="输入文本"
        />
      )}
      {content.value && (
        <div className="rounded-md bg-background px-2 py-1.5 text-center text-sm min-h-[2rem] flex items-center justify-center">
          <ContentRenderer content={content} />
        </div>
      )}
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
