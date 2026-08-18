import { useMemo, useState } from 'react'
import { AppShell } from '@/components/AppShell'
import { SentenceAssemblyGame } from '@/components/SentenceAssemblyGame'
import { SentenceTranslateGame } from '@/components/SentenceTranslateGame'
import { TopicSelector } from '@/components/TopicSelector'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button'
import { Link } from 'react-router-dom'
import { Shuffle, ArrowLeftRight, BookOpen } from 'lucide-react'
import { useSentences } from '@/hooks/useSentences'
import { useTopics } from '@/hooks/useTopics'
import { masteryOf, sampleWeight } from '@/lib/weight'

type Mode = 'assembly' | 'translate'

/**
 * 组句 / 翻译 测验页面
 * - 从活动组句专题中随机抽取一道题目
 * - 支持组句题与翻译题两种模式，可切换
 * - 提供"换一题"按钮重新随机
 */
export default function SentenceTestPage() {
  const sentencesApi = useSentences()
  const { activeSentencesTopicId } = useTopics()
  const [mode, setMode] = useState<Mode>('assembly')
  const [seed, setSeed] = useState(0)

  const candidates = useMemo(
    () => sentencesApi.sentences.filter((s) => s.words.length > 0),
    [sentencesApi.sentences],
  )

  const currentId = useMemo(() => {
    if (candidates.length === 0) return null
    // 按熟练度加权采样：y = 0.97^x，越熟练出现越少
    const weights = candidates.map((s) => sampleWeight(masteryOf(s)))
    const total = weights.reduce((a, b) => a + b, 0)
    let r = Math.random() * total
    let idx = candidates.length - 1
    for (let i = 0; i < candidates.length; i++) {
      r -= weights[i]
      if (r <= 0) {
        idx = i
        break
      }
    }
    return candidates[idx].id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, seed])

  const reshuffle = () => setSeed((s) => s + 1)
  const toggleMode = () =>
    setMode((m) => (m === 'assembly' ? 'translate' : 'assembly'))

  if (sentencesApi.sentences.length === 0) {
    return (
      <AppShell title="组句 / 翻译" extra={<TopicSelector type="sentences" />}>
        <div className="rounded-md border border-dashed p-10 text-center space-y-3">
          <p className="text-muted-foreground">当前专题没有题目，无法开始测验。</p>
          <Link to="/manage" className={buttonVariants({ variant: 'default' })}>
            <BookOpen className="h-4 w-4" />
            前往题库管理
          </Link>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title="组句 / 翻译" extra={<TopicSelector type="sentences" />}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-md border p-1 bg-muted/30">
            <Button
              variant="ghost"
              size="sm"
              className={
                mode === 'assembly'
                  ? 'bg-background text-foreground shadow-sm rounded-sm px-4'
                  : 'text-muted-foreground hover:text-foreground rounded-sm px-4'
              }
              onClick={() => setMode('assembly')}
            >
              组句题
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={
                mode === 'translate'
                  ? 'bg-background text-foreground shadow-sm rounded-sm px-4'
                  : 'text-muted-foreground hover:text-foreground rounded-sm px-4'
              }
              onClick={() => setMode('translate')}
            >
              翻译题
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={toggleMode}>
              <ArrowLeftRight className="h-4 w-4" />
              切换模式
            </Button>
            <Button variant="default" size="sm" onClick={reshuffle}>
              <Shuffle className="h-4 w-4" />
              换一题
            </Button>
          </div>
        </div>

        {currentId && (
          <div
            key={`${activeSentencesTopicId ?? 'none'}-${mode}-${currentId}-${seed}`}
          >
            {mode === 'assembly' ? (
              <SentenceAssemblyGame sentenceId={currentId} />
            ) : (
              <SentenceTranslateGame sentenceId={currentId} />
            )}
          </div>
        )}

        {candidates.length === 0 && sentencesApi.sentences.length > 0 && (
          <div className="rounded-md border border-dashed p-8 text-center space-y-3">
            <p className="text-muted-foreground">
              当前专题没有已分词的题目（请在题库管理中分词后再作答）。
            </p>
            <Link to="/manage" className={buttonVariants({ variant: 'default' })}>
              <BookOpen className="h-4 w-4" />
              去题库分词
            </Link>
          </div>
        )}
      </div>
    </AppShell>
  )
}
