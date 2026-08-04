import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { TextItem } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Trash2, Search, ListChecks, PenLine, Sparkles } from 'lucide-react'
import { countBlanks } from '@/lib/parser'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

export interface TextListProps {
  texts: TextItem[]
  onAdd: () => void
  onEdit: (text: TextItem) => void
  onDelete: (id: string) => void
  onAiGenerate?: () => void
}

const PAGE_SIZE = 8

/**
 * 文本列表
 */
export function TextList({ texts, onAdd, onEdit, onDelete, onAiGenerate }: TextListProps) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return texts
    return texts.filter((t) => t.content.toLowerCase().includes(q))
  }, [texts, query])

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
            placeholder="搜索文本内容..."
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
      </div>

      {filtered.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          {texts.length === 0 ? '文本库为空' : '没有匹配的结果'}
        </div>
      ) : (
        <ul className="space-y-2">
          {pageItems.map((text) => {
            const blankCount = countBlanks(text.content)
            return (
              <li
                key={text.id}
                className={cn(
                  'rounded-md border bg-card p-3 transition-colors hover:border-primary/40',
                )}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className="line-clamp-2 flex-1 whitespace-pre-wrap break-words text-sm">
                    {text.content}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onEdit(text)}
                      title="编辑"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onDelete(text.id)}
                      title="删除"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    <ListChecks className="h-3 w-3" />
                    {blankCount} 空白
                  </Badge>
                  {blankCount > 0 && (
                    <>
                      <Link
                        to={`/fill/select/${text.id}`}
                        className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                      >
                        <Search className="h-3 w-3" />
                        选词
                      </Link>
                      <Link
                        to={`/fill/input/${text.id}`}
                        className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                      >
                        <PenLine className="h-3 w-3" />
                        填空
                      </Link>
                    </>
                  )}
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
