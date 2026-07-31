import { useEffect } from 'react'
import { useMatchEngine } from '@/hooks/useMatchEngine'
import { MatchCard } from '@/components/MatchCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RefreshCw, Sparkles } from 'lucide-react'

/**
 * 模式一主组件：左右配对
 * - 选对：那一对变绿，其他选项淡出；1.2s 后自动重开新一把（避开上一轮）
 * - 选错：选中项变红 0.8s 后清除可继续选
 * - 不再显示文字提示，颜色变化即反馈
 */
export function MatchGame() {
  const engine = useMatchEngine()

  // 自动开始
  useEffect(() => {
    if (engine.canPlay && !engine.session) {
      engine.start()
    }
  }, [engine])

  if (!engine.canPlay) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          题库不足 4 组，请到
          <a className="mx-1 text-primary underline" href="/manage">
            题库管理
          </a>
          添加或恢复默认。
        </CardContent>
      </Card>
    )
  }

  if (!engine.session) {
    return (
      <Card>
        <CardContent className="py-10 flex flex-col items-center gap-4">
          <p className="text-muted-foreground">准备好了吗？</p>
          <Button onClick={() => engine.start()}>
            <Sparkles className="h-4 w-4" />
            开始
          </Button>
        </CardContent>
      </Card>
    )
  }

  const { session } = engine
  const lookup = (id: string) => session!.pairs.find((p) => p.id === id)!
  const { justMatchedId, justWrongIds } = engine

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span>配对测验</span>
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
        <CardContent>
          {/* 用 roundKey 作 key 触发载入动画 */}
          <div
            key={engine.roundKey}
            className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-3 duration-300"
          >
            <div className="space-y-2">
              {session.leftOrder.map((id) => {
                const pair = lookup(id)
                return (
                  <MatchCard
                    key={`L-${engine.roundKey}-${id}`}
                    content={pair.left}
                    pairId={id}
                    side="left"
                    selected={session.selectedLeft === id}
                    justMatched={justMatchedId === id}
                    justWrong={justWrongIds?.left === id}
                    faded={!!justMatchedId && justMatchedId !== id}
                    onClick={() => engine.selectLeft(id)}
                  />
                )
              })}
            </div>
            <div className="space-y-2">
              {session.rightOrder.map((id) => {
                const pair = lookup(id)
                return (
                  <MatchCard
                    key={`R-${engine.roundKey}-${id}`}
                    content={pair.right}
                    pairId={id}
                    side="right"
                    selected={session.selectedRight === id}
                    justMatched={justMatchedId === id}
                    justWrong={justWrongIds?.right === id}
                    faded={!!justMatchedId && justMatchedId !== id}
                    onClick={() => engine.selectRight(id)}
                  />
                )
              })}
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            提示：左右各选一个即可判定。选对即重开新一把。
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
