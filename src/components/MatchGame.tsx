import { useEffect } from 'react'
import { useMatchEngine } from '@/hooks/useMatchEngine'
import { MatchCard } from '@/components/MatchCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RefreshCw, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * 模式一主组件：左右配对
 * - 普通难度：4 组 pair，左右分别打乱
 * - 困难难度：5+5 选项中只有一对正确答案（1 正确 + 4 左干扰 + 4 右干扰）
 * - 选对：那一对变绿，其他选项淡出；1.2s 后自动重开新一把（避开上一轮）
 * - 选错：选中项变红 0.8s 后变回去
 * - 不再显示文字提示，颜色变化即反馈
 */
export function MatchGame() {
  const engine = useMatchEngine()
  const { difficulty, canPlayHard } = engine

  // 切换到困难模式但题库不足时，自动回退到普通
  useEffect(() => {
    if (difficulty === 'hard' && !canPlayHard) {
      engine.setDifficulty('normal')
    }
  }, [difficulty, canPlayHard, engine])

  // 普通模式自动开始
  useEffect(() => {
    if (difficulty === 'normal' && engine.canPlay && !engine.session) {
      engine.start()
    }
  }, [engine, difficulty])

  // 题库不足
  if (!engine.canPlay) {
    const min = difficulty === 'hard' ? 9 : 4
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          题库不足 {min} 组，请到
          <a className="mx-1 text-primary underline" href="/manage">
            题库管理
          </a>
          添加或恢复默认。
        </CardContent>
      </Card>
    )
  }

  // 困难模式未开始时显示开始界面 + 难度选择
  if (!engine.session) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span>配对测验</span>
            <DifficultySwitch engine={engine} />
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <p className="text-muted-foreground">
            {difficulty === 'hard'
              ? '困难模式：5+5 选项中只有一对正确答案，准备好了吗？'
              : '准备好了吗？'}
          </p>
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
  const { justMatchedId, justWrongIds, markedIrrelevantIds } = engine
  const isIrrelevant = (id: string, side: 'left' | 'right') =>
    markedIrrelevantIds.includes(`${id}:${side}`)

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
          <DifficultySwitch engine={engine} />
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
                    markedIrrelevant={isIrrelevant(id, 'left')}
                    onLongPress={() => engine.toggleIrrelevant(id, 'left')}
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
                    markedIrrelevant={isIrrelevant(id, 'right')}
                    onLongPress={() => engine.toggleIrrelevant(id, 'right')}
                    onClick={() => engine.selectRight(id)}
                  />
                )
              })}
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {difficulty === 'hard'
              ? '困难模式：左右各 5 个选项，只有一组能正确配对。长按可标记无关选项，再次长按取消。'
              : '提示：左右各选一个即可判定。选对即重开新一把。长按可标记无关选项，再次长按取消。'}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

/** 难度切换器：普通 / 困难（困难需 ≥9 组题库） */
function DifficultySwitch({
  engine,
}: {
  engine: ReturnType<typeof useMatchEngine>
}) {
  const { difficulty, setDifficulty, canPlayHard } = engine
  const options: { label: string; value: 'normal' | 'hard' }[] = [
    { label: '普通', value: 'normal' },
    { label: '困难', value: 'hard' },
  ]
  return (
    <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
      {options.map((opt) => {
        const active = difficulty === opt.value
        const disabled = opt.value === 'hard' && !canPlayHard
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => setDifficulty(opt.value)}
            className={cn(
              'rounded-sm px-3 py-1 text-xs font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
              disabled && 'cursor-not-allowed opacity-40 hover:text-muted-foreground',
            )}
            title={disabled ? '题库不足 9 组，无法使用困难模式' : undefined}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
