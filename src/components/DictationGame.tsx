import { useEffect } from 'react'
import { useDictationEngine } from '@/hooks/useDictationEngine'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ContentListRenderer,
  ContentRenderer,
} from '@/components/ContentRenderer'
import { AlertCircle, Eye, RefreshCw, Sparkles } from 'lucide-react'

/**
 * 默写题主组件
 * - 随机显示配对一侧的内容，要求输入另一侧的内容（满足一项即可）
 * - 答错可重试；「看答案」揭示标准答案
 */
export function DictationGame() {
  const engine = useDictationEngine()

  useEffect(() => {
    if (engine.canPlay && !engine.session) {
      engine.start()
    }
  }, [engine])

  if (!engine.canPlay) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          题库为空，请先到
          <a className="mx-1 text-primary underline" href="/manage">
            题库管理
          </a>
          添加配对题。
        </CardContent>
      </Card>
    )
  }

  if (!engine.session) {
    return (
      <Card>
        <CardContent className="py-10 flex flex-col items-center gap-4">
          <Button onClick={() => engine.start()}>
            <Sparkles className="h-4 w-4" />
            开始
          </Button>
        </CardContent>
      </Card>
    )
  }

  const { session } = engine
  const done =
    session.resolved === 'correct' || session.resolved === 'revealed'
  const canConfirm = session.input.trim().length > 0 && !done
  const directionLabel =
    session.direction === 'askLeft' ? '右侧内容' : '左侧内容'

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span>默写测验</span>
            <div className="flex items-center gap-3 text-sm font-normal">
              <span className="text-success">✓ {engine.score}</span>
              <span className="text-destructive">✗ {engine.errors}</span>
              <Button variant="ghost" size="sm" onClick={() => engine.start()}>
                <RefreshCw className="h-4 w-4" />
                重开
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 题目 */}
          <div className="rounded-lg border bg-muted/30 px-4 py-6 text-center">
            <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
              题目
            </div>
            <div className="text-lg font-medium">
              <ContentRenderer content={session.prompt} />
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              在下方输入与它对应的{directionLabel}（多项内容任填一项即可）
            </div>
          </div>

          {/* 输入区 */}
          <div className="flex gap-2">
            <Input
              value={session.input}
              onChange={(e) => engine.setInput(e.target.value)}
              placeholder="输入答案..."
              disabled={done}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canConfirm) engine.confirm()
              }}
            />
            <Button onClick={() => engine.confirm()} disabled={!canConfirm}>
              确认
            </Button>
          </div>

          {/* 反馈 */}
          {session.resolved === 'wrong' && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4" />
              <span>回答不正确，请再试一次。</span>
            </div>
          )}
          {session.resolved === 'correct' && (
            <div className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
              回答正确！
              {session.wrongCount > 0 &&
                `（本题曾答错 ${session.wrongCount} 次，熟练度增量已按 0.95 衰减）`}
            </div>
          )}
          {session.resolved === 'revealed' && (
            <div className="space-y-3">
              <div className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm">
                <span className="text-muted-foreground">标准答案：</span>
                <ContentListRenderer contents={session.answers} />
              </div>
              <div className="flex justify-end">
                <Button onClick={() => engine.next()}>下一题</Button>
              </div>
            </div>
          )}

          {/* 看答案（放弃） */}
          {(session.resolved === 'idle' || session.resolved === 'wrong') && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                比对忽略标点、空白与大小写。
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => engine.reveal()}
              >
                <Eye className="h-4 w-4" />
                看答案（放弃）
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
