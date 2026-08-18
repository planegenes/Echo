import { useState } from 'react'
import type { ModelConfig, ThinkingLevel } from '@/types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react'

export interface ModelConfigEditorProps {
  modelId: string
  config: ModelConfig
  onChange: (config: ModelConfig) => void
  /** 思考参数风格提示，例如 "reasoning_effort" */
  thinkingStyleHint?: string
}

const THINKING_LEVELS: { value: ThinkingLevel; label: string }[] = [
  { value: 'off', label: '关闭' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
]

/**
 * 单个模型的配置编辑器
 * - 思考等级（off/low/medium/high）
 * - 自定义参数（JSON 文本框，浅合并到请求 payload 顶层）
 */
export function ModelConfigEditor({
  modelId,
  config,
  onChange,
  thinkingStyleHint,
}: ModelConfigEditorProps) {
  const [expanded, setExpanded] = useState(false)
  const [jsonText, setJsonText] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)

  // 同步外部 config.customParams 到文本框（渲染期调整）
  const [prevParams, setPrevParams] = useState(config.customParams)
  if (prevParams !== config.customParams) {
    setPrevParams(config.customParams)
    setJsonText(
      config.customParams && Object.keys(config.customParams).length > 0
        ? JSON.stringify(config.customParams, null, 2)
        : '',
    )
    setJsonError(null)
  }

  const handleThinkingChange = (level: ThinkingLevel) => {
    onChange({ ...config, thinkingLevel: level })
  }

  const handleJsonChange = (text: string) => {
    setJsonText(text)
    if (!text.trim()) {
      setJsonError(null)
      onChange({ ...config, customParams: undefined })
      return
    }
    try {
      const parsed = JSON.parse(text)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('必须是 JSON 对象')
      }
      setJsonError(null)
      onChange({ ...config, customParams: parsed as Record<string, unknown> })
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : 'JSON 解析失败')
    }
  }

  const handleReset = () => {
    onChange({ thinkingLevel: 'off' })
  }

  const hasCustom = config.thinkingLevel !== 'off' || (config.customParams && Object.keys(config.customParams).length > 0)

  return (
    <div className="rounded-md border bg-background">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between p-2 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate font-mono text-xs">{modelId}</span>
          {hasCustom && (
            <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
              已配置
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-xs text-muted-foreground">
            思考：{THINKING_LEVELS.find((t) => t.value === config.thinkingLevel)?.label}
          </span>
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="space-y-2 border-t p-2">
          {/* 思考等级 */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              思考等级
              {thinkingStyleHint && (
                <span className="ml-1 text-muted-foreground/70">
                  （{thinkingStyleHint}）
                </span>
              )}
            </Label>
            <div className="inline-flex rounded-md border bg-background p-0.5">
              {THINKING_LEVELS.map((lvl) => (
                <button
                  key={lvl.value}
                  type="button"
                  onClick={() => handleThinkingChange(lvl.value)}
                  className={
                    'rounded px-2 py-0.5 text-xs transition-colors ' +
                    (config.thinkingLevel === lvl.value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground')
                  }
                >
                  {lvl.label}
                </button>
              ))}
            </div>
          </div>

          {/* 自定义参数 JSON */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              自定义参数（JSON 对象，合并到请求 payload 顶层）
            </Label>
            <Textarea
              value={jsonText}
              onChange={(e) => handleJsonChange(e.target.value)}
              rows={4}
              placeholder={'例如：\n{\n  "temperature": 0.3,\n  "max_tokens": 1024\n}'}
              className="font-mono text-xs"
            />
            {jsonError && (
              <p className="text-xs text-destructive">{jsonError}</p>
            )}
          </div>

          {hasCustom && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleReset}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              重置为默认
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
