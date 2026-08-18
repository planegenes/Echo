import { useMemo, useState } from 'react'
import type { SentenceItem } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { MasteryControl } from '@/components/MasteryControl'
import { Plus, Pencil, Trash2, Search, Puzzle, Sparkles, Wand2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SentenceListProps {
  sentences: SentenceItem[]
  onAdd: () => void
  onEdit: (sentence: SentenceItem) => void
  onDelete: (id: string) => void
  /** 手动调整熟练度（delta = ±0.5） */
  onAdjustMastery: (id: string, delta: number) => void
  /** 重置熟练度为 0 */
  onResetMastery: (id: string) => void
  onAiGenerate?: () => void
  onAiEdit?: () => void
}

const PAGE_SIZE = 8

/**
 * 组句题目列表
 */
export function SentenceList({
  sentences,
  onAdd,
  onEdit,
  onDelete,
  onAdjustMastery,
  onResetMastery,
  onAiGenerate,
  onAiEdit,
}: SentenceListProps) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sentences
    return sentences.filter(
      (s) =>
        s.answer.toLowerCase().includes(q) ||
        s.hint.toLowerCase().includes(q),
    )
  }, [sentences, query])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 max-[360px]:basis-full">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(0)
            }}
            placeholder="搜索答案或提示..."
            className="pl-8"
          />
        </div>
        <Button onClick={onAdd}>
          <Plus className="h-4 w-4" />
          新增
        </Button>
        {onAiGenerate && (
          <Button variant="outline" onClick={onAiGenerate}>
            <Sparkles className="h-4 w-4" />
            AI 生成
          </Button>
        )}
        {onAiEdit && (
          <Button variant="outline" onClick={onAiEdit}>
            <Wand2 className="h-4 w-4" />
            AI 修改
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          {sentences.length === 0 ? '题库为空，点击「新增」添加第一道组句题' : '没有匹配的结果'}
        </div>
      ) : (
        <ul className="space-y-2">
          {pageItems.map((s) => (
            <li
              key={s.id}
              className={cn(
                'rounded-md border bg-card p-3 transition-colors hover:border-primary/40',
              )}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex-1 space-y-1">
                  <p className="break-words text-sm font-medium">{s.answer}</p>
                  {s.hint && (
                    <p className="break-words text-xs text-muted-foreground">
                      提示：{s.hint}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <MasteryControl
                    item={s}
                    onAdjust={(delta) => onAdjustMastery(s.id, delta)}
                    onReset={() => onResetMastery(s.id)}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onEdit(s)}
                    title="编辑"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onDelete(s.id)}
                    title="删除"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  <Puzzle className="h-3 w-3" />
                  {s.words.length} 词
                </Badge>
                {s.words.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {s.words.slice(0, 8).map((w, i) => (
                      <span
                        key={i}
                        className="rounded bg-muted/40 px-1.5 py-0.5 text-xs"
                      >
                        {w}
                      </span>
                    ))}
                    {s.words.length > 8 && (
                      <span className="text-xs text-muted-foreground">
                        …+{s.words.length - 8}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            上一页
          </Button>
          <span className="text-muted-foreground">
            {page + 1} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            下一页
          </Button>
        </div>
      )}
    </div>
  )
}
