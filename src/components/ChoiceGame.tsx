import { useEffect } from 'react'
import { useChoiceEngine } from '@/hooks/useChoiceEngine'
import { ChoiceOption } from '@/components/ChoiceOption'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ContentRenderer } from '@/components/ContentRenderer'
import { ArrowRight, RefreshCw, Sparkles, HelpCircle } from 'lucide-react'

/**
 * 模式二主组件：单选匹配
 */
export function ChoiceGame() {
  const engine = useChoiceEngine()

  useEffect(() => {
    if (engine.canPlay && !engine.session) {
      engine.start()
    }
  }, [engine])

  if (!engine.canPlay) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          题库不足 2 组，请先到
          <a className="mx-1 text-primary underline" href="/manage">
            题库管理
          </a>
          添加。
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
  const resolved = session.resolved !== 'idle'
  const isIrrelevant = (id: string) => engine.markedIrrelevantIds.includes(id)
  const isEliminated = (id: string) => engine.eliminatedIds.includes(id)

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-6 space-y-5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              方向：
              {session.direction === 'askLeft'
                ? '左侧 → 选右侧'
                : '右侧 → 选左侧'}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-success">✓ {engine.score}</span>
              <span className="text-destructive">✗ {engine.errors}</span>
              <Button variant="ghost" size="sm" onClick={() => engine.start()}>
                <RefreshCw className="h-4 w-4" />
                重开
              </Button>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 px-4 py-6 text-center">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              题目
            </div>
            <div className="text-lg font-medium">
              <ContentRenderer content={{ format: session.prompt.format, value: session.prompt.value }} />
            </div>
            <div className="mt-3 flex items-center justify-center text-xs text-muted-foreground">
              <ArrowRight className="h-3 w-3" />
              从下方选项中选择对应项
            </div>
          </div>

          {/* 选错时：在该选项上方浮现对应正确匹配（由 ChoiceOption 渲染） */}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {session.options.map((opt) => (
              <ChoiceOption
                key={opt.id}
                value={opt.value}
                format={opt.format}
                showCorrect={
                  (session.resolved === 'correct' ||
                    session.resolved === 'revealed') &&
                  opt.pairId === session.answerPairId
                }
                yellowCorrect={session.gaveUp === true}
                justWrong={engine.justWrongId === opt.id}
                floatingMatch={
                  engine.wrongMatch?.optionId === opt.id
                    ? engine.wrongMatch.content
                    : null
                }
                dimmed={isEliminated(opt.id) || isIrrelevant(opt.id)}
                canUnDim={isIrrelevant(opt.id)}
                onLongPress={() => engine.toggleIrrelevant(opt.id)}
                disabled={resolved || engine.justWrongId !== null}
                onClick={() => engine.selectOption(opt.id)}
              />
            ))}
          </div>

          {!resolved && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                长按可标记无关选项，再次长按取消。
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => engine.giveUp()}
                disabled={engine.justWrongId !== null}
                title="不会做：所有未熄灭选项提高错误率权重，并揭示正确答案"
              >
                <HelpCircle className="h-4 w-4" />
                不会做
              </Button>
            </div>
          )}

          {session.resolved === 'revealed' && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                答题结束，正确答案已高亮显示
              </p>
              <Button onClick={() => engine.next()}>下一题</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
