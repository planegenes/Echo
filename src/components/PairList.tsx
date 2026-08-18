import { useMemo, useState } from 'react'
import type { PairItem } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ContentListRenderer } from '@/components/ContentRenderer'
import { MasteryControl } from '@/components/MasteryControl'
import { Plus, Pencil, Trash2, Search, Sparkles, Wand2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PairListProps {
  pairs: PairItem[]
  onAdd: () => void
  onEdit: (pair: PairItem) => void
  onDelete: (id: string) => void
  /** 手动调整熟练度（delta = ±0.5） */
  onAdjustMastery: (id: string, delta: number) => void
  /** 重置熟练度为 0 */
  onResetMastery: (id: string) => void
  onAiGenerate?: () => void
  onAiEdit?: () => void
}

const PAGE_SIZE = 10

/**
 * pair 列表，支持搜索、分页、删除、熟练度调整
 */
export function PairList({
  pairs,
  onAdd,
  onEdit,
  onDelete,
  onAdjustMastery,
  onResetMastery,
  onAiGenerate,
  onAiEdit,
}: PairListProps) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return pairs
    return pairs.filter(
      (p) =>
        p.left.some((c) => c.value.toLowerCase().includes(q)) ||
        p.right.some((c) => c.value.toLowerCase().includes(q)),
    )
  }, [pairs, query])

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
            placeholder="搜索 left / right 内容..."
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
          {pairs.length === 0 ? '题库为空' : '没有匹配的结果'}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {pageItems.map((pair) => {
            return (
              <li
                key={pair.id}
                className={cn(
                  // 三部分严格三等分（left / right / 操作区 各 1/3，不受内容量影响）
                  'grid grid-cols-2 items-center gap-2 rounded-md border bg-card px-3 py-2',
                  'min-[361px]:grid-cols-[1fr_1fr_1fr]',
                  'hover:border-primary/40 transition-colors',
                )}
              >
                <div className="min-w-0 truncate">
                  <ContentListRenderer contents={pair.left} />
                </div>
                <div className="min-w-0 truncate text-center">
                  <ContentListRenderer contents={pair.right} />
                </div>

                {/* 格式徽章 / 熟练度操作区 / 编辑删除：三等分列内右对齐；极小宽度下换到第二行整行 */}
                <div className="col-span-2 flex items-center gap-1 min-[361px]:col-span-1 min-[361px]:justify-end">
                  {pair.left.some((c) => c.format === 'latex') ||
                  pair.right.some((c) => c.format === 'latex') ? (
                    <Badge variant="outline">LaTeX</Badge>
                  ) : null}
                  {pair.left.some((c) => c.format === 'ruby') ||
                  pair.right.some((c) => c.format === 'ruby') ? (
                    <Badge variant="outline">注音</Badge>
                  ) : null}
                  <MasteryControl
                    item={pair}
                    onAdjust={(delta) => onAdjustMastery(pair.id, delta)}
                    onReset={() => onResetMastery(pair.id)}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onEdit(pair)}
                    title="编辑"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onDelete(pair.id)}
                    title="删除"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </li>
            )
          })}
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
