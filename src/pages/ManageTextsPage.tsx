import { useMemo, useState } from 'react'
import { AppShell } from '@/components/AppShell'
import { FillSelectGame } from '@/components/FillSelectGame'
import { FillInputGame } from '@/components/FillInputGame'
import { TopicSelector } from '@/components/TopicSelector'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button'
import { Link } from 'react-router-dom'
import { Shuffle, ArrowLeftRight, BookOpen } from 'lucide-react'
import { useTexts } from '@/hooks/useTexts'
import { useTopics } from '@/hooks/useTopics'
import { countBlanks } from '@/lib/parser'

type Mode = 'select' | 'input'

/**
 * 填空测验页面
 * - 从活动专题中随机抽取一段有空白的文本
 * - 支持选词填空与输入填空两种模式，可切换
 * - 提供"换一段"按钮重新随机
 */
export default function ManageTextsPage() {
  const textsApi = useTexts()
  const { activeTextsTopicId } = useTopics()
  const [mode, setMode] = useState<Mode>('select')
  const [seed, setSeed] = useState(0)

  const candidateTexts = useMemo(
    () => textsApi.texts.filter((t) => countBlanks(t.content) > 0),
    [textsApi.texts],
  )

  const currentTextId = useMemo(() => {
    if (candidateTexts.length === 0) return null
    const idx = Math.floor(Math.random() * candidateTexts.length)
    return candidateTexts[idx].id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateTexts, seed])

  const reshuffle = () => setSeed((s) => s + 1)
  const toggleMode = () => setMode((m) => (m === 'select' ? 'input' : 'select'))

  if (textsApi.texts.length === 0) {
    return (
      <AppShell title="填空测验" extra={<TopicSelector type="texts" />}>
        <div className="rounded-md border border-dashed p-10 text-center space-y-3">
          <p className="text-muted-foreground">当前专题没有文本，无法开始测验。</p>
          <Link to="/manage" className={buttonVariants({ variant: 'default' })}>
            <BookOpen className="h-4 w-4" />
            前往题库管理
          </Link>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title="填空测验" extra={<TopicSelector type="texts" />}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-md border p-1 bg-muted/30">
            <Button
              variant="ghost"
              size="sm"
              className={
                mode === 'select'
                  ? 'bg-background text-foreground shadow-sm rounded-sm px-4'
                  : 'text-muted-foreground hover:text-foreground rounded-sm px-4'
              }
              onClick={() => setMode('select')}
            >
              选词填空
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={
                mode === 'input'
                  ? 'bg-background text-foreground shadow-sm rounded-sm px-4'
                  : 'text-muted-foreground hover:text-foreground rounded-sm px-4'
              }
              onClick={() => setMode('input')}
            >
              输入填空
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={toggleMode}>
              <ArrowLeftRight className="h-4 w-4" />
              切换模式
            </Button>
            <Button variant="default" size="sm" onClick={reshuffle}>
              <Shuffle className="h-4 w-4" />
              换一段
            </Button>
          </div>
        </div>

        {currentTextId && (
          <div key={`${activeTextsTopicId ?? 'none'}-${mode}-${currentTextId}-${seed}`}>
            {mode === 'select' ? (
              <FillSelectGame textId={currentTextId} />
            ) : (
              <FillInputGame textId={currentTextId} />
            )}
          </div>
        )}

        {candidateTexts.length === 0 && textsApi.texts.length > 0 && (
          <div className="rounded-md border border-dashed p-8 text-center space-y-3">
            <p className="text-muted-foreground">
              当前专题没有带空白（*xxx*）的文本，无法进行填空测验。
            </p>
            <Link to="/manage" className={buttonVariants({ variant: 'default' })}>
              <BookOpen className="h-4 w-4" />
              去题库添加带空白的文本
            </Link>
          </div>
        )}
      </div>
    </AppShell>
  )
}
