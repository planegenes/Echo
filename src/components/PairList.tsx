import { useMemo, useState } from 'react'
import type { PairItem } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ContentRenderer } from '@/components/ContentRenderer'
import { Plus, Pencil, Trash2, Search, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PairListProps {
  pairs: PairItem[]
  onAdd: () => void
  onEdit: (pair: PairItem) => void
  onDelete: (id: string) => void
  onResetStats: (id: string) => void
}

const PAGE_SIZE = 10

/**
 * pair 列表，支持搜索、分页、删除、重置记录
 */
export function PairList({
  pairs,
  onAdd,
  onEdit,
  onDelete,
  onResetStats,
}: PairListProps) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return pairs
    return pairs.filter(
      (p) =>
        p.left.value.toLowerCase().includes(q) ||
        p.right.value.toLowerCase().includes(q),
    )
  }, [pairs, query])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
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
      </div>

      {filtered.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          {pairs.length === 0 ? '题库为空' : '没有匹配的结果'}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {pageItems.map((pair) => {
            const totalErr = (pair.stats?.lr ?? 0) + (pair.stats?.rl ?? 0)
            return (
              <li
                key={pair.id}
                className={cn(
                  'flex items-center gap-3 rounded-md border bg-card px-3 py-2',
                  'hover:border-primary/40 transition-colors',
                )}
              >
                <div className="flex flex-1 items-center gap-3 min-w-0">
                  <div className="flex-1 min-w-0 truncate">
                    <ContentRenderer content={pair.left} />
                  </div>
                  <div className="flex-1 min-w-0 truncate">
                    <ContentRenderer content={pair.right} />
                  </div>
                </div>

                {pair.left.format === 'latex' || pair.right.format === 'latex' ? (
                  <Badge variant="outline">LaTeX</Badge>
                ) : null}
                {totalErr > 0 && (
                  <Badge variant="warning" title="累计错误权重">
                    {totalErr}
                  </Badge>
                )}

                <div className="flex items-center gap-1">
                  {totalErr > 0 && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onResetStats(pair.id)}
                      title="重置学习记录"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
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
