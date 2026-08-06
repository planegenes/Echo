import { useEffect } from 'react'
import { useSentenceTranslateEngine } from '@/hooks/useSentenceTranslateEngine'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AlertCircle, Loader2, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SentenceTranslateGameProps {
  sentenceId: string | null
}

/**
 * 翻译题主组件
 * - 上方：提示
 * - 下方：输入框作答，确认后字面比对 + AI 语义判断
 */
export function SentenceTranslateGame({ sentenceId }: SentenceTranslateGameProps) {
  const engine = useSentenceTranslateEngine(sentenceId)

  useEffect(() => {
    if (engine.canPlay && !engine.session) engine.start()
  }, [engine])

  if (!sentenceId) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          请先选择一道题目。
        </CardContent>
      </Card>
    )
  }

  if (!engine.aiReady) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground space-y-3">
          <div className="flex items-center justify-center gap-2">
            <AlertCircle className="h-5 w-5 text-warning" />
            <span>AI 接口未配置</span>
          </div>
          <p className="text-sm">
            翻译题需要调用 AI 进行语义判断，请先到
            <a className="mx-1 text-primary underline" href="/settings">
              设置页
            </a>
            填写 endpoint 与 api key。
          </p>
        </CardContent>
      </Card>
    )
  }

  if (!engine.sentence || !engine.session) return null

  const { sentence, session, result } = engine
  const canConfirm = session.input.trim().length > 0 && !engine.loading

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">翻译题</CardTitle>
        <CardDescription>
          根据提示输入答案，确认后先字面比对，不一致时调用 AI 判断。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 上方：提示 */}
        <div className="rounded-lg border bg-muted/20 p-3 text-sm">
          <span className="text-muted-foreground">提示：</span>
          <span className="font-medium">{sentence.hint || '（无提示）'}</span>
        </div>

        {/* 下方：输入框 */}
        <Textarea
          value={session.input}
          onChange={(e) => engine.setInput(e.target.value)}
          rows={3}
          placeholder="输入你的答案..."
          disabled={session.confirmed || engine.loading}
          autoFocus
        />

        {engine.error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <div className="flex-1">
              <div className="font-medium">AI 调用失败</div>
              <div className="text-xs">{engine.error}</div>
            </div>
          </div>
        )}

        {!session.confirmed ? (
          <div className="flex justify-end">
            <Button
              onClick={() => engine.confirm()}
              disabled={!canConfirm}
            >
              {engine.loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {engine.loading ? 'AI 评判中...' : '确认'}
            </Button>
          </div>
        ) : (
          result && (
            <div className="space-y-3">
              <div
                className={cn(
                  'rounded-md border px-3 py-2 text-sm',
                  result.correct
                    ? 'border-success/40 bg-success/10 text-success'
                    : 'border-destructive/40 bg-destructive/10 text-destructive',
                )}
              >
                <div className="font-medium">
                  {result.correct ? '回答正确！' : '回答不正确。'}
                  {result.exactMatch && '（字面一致）'}
                </div>
                {!result.correct && (
                  <div className="mt-1 text-xs opacity-90">
                    标准答案：{sentence.answer}
                  </div>
                )}
                {result.reason && (
                  <div className="mt-1 text-xs opacity-80">
                    AI：{result.reason}
                  </div>
                )}
              </div>
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => engine.reset()}
                >
                  <RotateCcw className="h-4 w-4" />
                  再来一次
                </Button>
              </div>
            </div>
          )
        )}
      </CardContent>
    </Card>
  )
}
