import { Check, X, RotateCcw } from 'lucide-react'
import type { FillBlankResult } from '@/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export interface FillResultPanelProps {
  results: FillBlankResult[]
  onRetry: () => void
  className?: string
}

/**
 * 确认后的结果展示
 * - 总分：x / total
 * - 每空：✓/✗ + 用户答案 + （错误时）标准答案 + （有理由时）理由
 */
export function FillResultPanel({
  results,
  onRetry,
  className,
}: FillResultPanelProps) {
  const correctCount = results.filter((r) => r.correct).length
  const total = results.length
  const all = correctCount === total

  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-4 space-y-3',
        all ? 'border-success' : 'border-border',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {all ? (
            <Check className="h-5 w-5 text-success" />
          ) : (
            <X className="h-5 w-5 text-destructive" />
          )}
          <span className="font-semibold">
            {correctCount} / {total} 正确
          </span>
          <Badge variant={all ? 'success' : 'warning'}>
            {Math.round((correctCount / Math.max(total, 1)) * 100)}%
          </Badge>
        </div>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw className="h-4 w-4" />
          重做
        </Button>
      </div>
      <ul className="space-y-2 text-sm">
        {results.map((r, i) => (
          <li
            key={r.blankId}
            className={cn(
              'flex flex-col gap-1 rounded-md border p-2',
              r.correct
                ? 'border-success/40 bg-success/5'
                : 'border-destructive/40 bg-destructive/5',
            )}
          >
            <div className="flex items-start gap-2">
              {r.correct ? (
                <Check className="mt-0.5 h-4 w-4 text-success" />
              ) : (
                <X className="mt-0.5 h-4 w-4 text-destructive" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground">
                  空白 #{i + 1}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    你的答案：{r.userAnswer || '(空)'}
                  </span>
                  {!r.correct && (
                    <span className="text-muted-foreground">
                      标准答案：
                      <span className="font-medium text-foreground">
                        {r.correctAnswer}
                      </span>
                    </span>
                  )}
                </div>
                {r.reason && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    判断理由：{r.reason}
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
