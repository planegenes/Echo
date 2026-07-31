import { useEffect } from 'react'
import { useFillInputEngine } from '@/hooks/useFillInputEngine'
import { TextRenderer } from '@/components/TextRenderer'
import { BlankInput } from '@/components/BlankInput'
import { FillResultPanel } from '@/components/FillResultPanel'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AlertCircle, Loader2 } from 'lucide-react'

export interface FillInputGameProps {
  textId: string | null
}

/**
 * 填空模式主组件（输入 + AI 评判）
 */
export function FillInputGame({ textId }: FillInputGameProps) {
  const engine = useFillInputEngine(textId)

  useEffect(() => {
    if (engine.canPlay && !engine.session) {
      engine.start()
    }
  }, [engine])

  if (!textId) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          请先选择一段文本。
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
            填空模式需要调用 AI 进行语义判断，请先到
            <a className="mx-1 text-primary underline" href="/settings">
              设置页
            </a>
            填写 endpoint 与 api key。
          </p>
        </CardContent>
      </Card>
    )
  }

  if (!engine.canPlay) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          该文本没有可识别的空白（使用 <code>*内容*</code> 标记空白）。
        </CardContent>
      </Card>
    )
  }

  if (!engine.parsed || !engine.session) return null

  const allFilled = Object.values(engine.session.inputs).every((v) =>
    v.trim().length > 0,
  )

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">填空（输入）模式</CardTitle>
        <CardDescription>
          直接输入答案，确认后调用 AI 进行语义判断。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/20 p-4 text-base">
          <TextRenderer
            parsed={engine.parsed}
            renderBlank={(seg) => {
              const result = engine.results?.find(
                (r) => r.blankId === seg.id,
              )
              return (
                <BlankInput
                  blankId={seg.id}
                  pad={engine.blankPad}
                  value={engine.session!.inputs[seg.id] ?? ''}
                  onChange={(v) => engine.setInput(seg.id, v)}
                  result={result ? (result.correct ? 'correct' : 'wrong') : null}
                  standardAnswer={result?.correctAnswer}
                  disabled={engine.session!.confirmed || engine.loading}
                />
              )
            }}
          />
        </div>

        {engine.error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <div className="flex-1">
              <div className="font-medium">AI 调用失败</div>
              <div className="text-xs">{engine.error}</div>
            </div>
          </div>
        )}

        {!engine.session.confirmed ? (
          <div className="flex justify-end">
            <Button
              onClick={() => engine.confirm()}
              disabled={!allFilled || engine.loading}
            >
              {engine.loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {engine.loading ? 'AI 评判中...' : '确认并交给 AI 评判'}
            </Button>
          </div>
        ) : (
          engine.results && (
            <FillResultPanel
              results={engine.results}
              onRetry={() => engine.reset()}
            />
          )
        )}
      </CardContent>
    </Card>
  )
}
