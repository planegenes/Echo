import { useState } from 'react'
import type { AppSettings } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchAvailableModels } from '@/lib/ai'
import { Eye, EyeOff, Volume2, Moon, Server, Save, RotateCcw, RefreshCw, Loader2 } from 'lucide-react'

export interface SettingsFormProps {
  settings: AppSettings
  onSubmit: (patch: Partial<AppSettings>) => void | Promise<void>
  onReset: () => void | Promise<void>
}

/**
 * AI 接口、主题、音效设置表单
 */
export function SettingsForm({
  settings,
  onSubmit,
  onReset,
}: SettingsFormProps) {
  const [form, setForm] = useState<AppSettings>(settings)
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)

  const handleFetchModels = async () => {
    setModelsLoading(true)
    setModelsError(null)
    try {
      const list = await fetchAvailableModels(form)
      setModels(list)
      if (list.length === 0) setModelsError('未获取到模型列表')
    } catch (e) {
      setModelsError(e instanceof Error ? e.message : '获取失败')
    } finally {
      setModelsLoading(false)
    }
  }

  const patch = (p: Partial<AppSettings>) =>
    setForm((cur) => ({ ...cur, ...p }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSubmit(form)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">应用设置</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-md border p-3">
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4" />
            <div>
              <Label>音效</Label>
              <p className="text-xs text-muted-foreground">
                操作反馈音效（未来扩展用）
              </p>
            </div>
          </div>
          <Switch
            checked={form.soundEnabled}
            onCheckedChange={(v) => patch({ soundEnabled: v })}
          />
        </div>

        <div className="flex items-center justify-between rounded-md border p-3">
          <div className="flex items-center gap-2">
            <Moon className="h-4 w-4" />
            <div>
              <Label>深色模式</Label>
              <p className="text-xs text-muted-foreground">
                切换浅色 / 深色主题
              </p>
            </div>
          </div>
          <Switch
            checked={form.darkMode}
            onCheckedChange={(v) => patch({ darkMode: v })}
          />
        </div>

        <div className="space-y-2 rounded-md border p-3">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4" />
            <Label>AI 接口配置</Label>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Endpoint（OpenAI 兼容）
            </Label>
            <Input
              value={form.aiEndpoint}
              onChange={(e) => patch({ aiEndpoint: e.target.value })}
              placeholder="https://api.openai.com/v1"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">模型名</Label>
            <div className="flex items-center gap-1">
              <Input
                value={form.aiModel}
                onChange={(e) => patch({ aiModel: e.target.value })}
                placeholder="gpt-4o-mini、deepseek-v4-flash 等"
                list="ai-model-list"
                autoComplete="off"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => void handleFetchModels()}
                disabled={modelsLoading || !form.aiEndpoint || !form.aiApiKey}
                title="从接口获取可用模型"
              >
                {modelsLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
            <datalist id="ai-model-list">
              {models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            {modelsError && (
              <p className="text-xs text-destructive">{modelsError}</p>
            )}
            {models.length > 0 && (
              <p className="text-xs text-muted-foreground">
                已获取 {models.length} 个可用模型，点击输入框下拉选择。
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">API Key</Label>
            <div className="flex items-center gap-1">
              <Input
                type={showKey ? 'text' : 'password'}
                value={form.aiApiKey}
                onChange={(e) => patch({ aiApiKey: e.target.value })}
                placeholder="sk-..."
                autoComplete="off"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowKey((s) => !s)}
                title={showKey ? '隐藏' : '显示'}
              >
                {showKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              配置仅保存在本地 IndexedDB 与 localStorage，不会上传服务器。
            </p>
          </div>
        </div>

        <div className="flex justify-between gap-2">
          <Button variant="ghost" onClick={() => onReset()} disabled={saving}>
            <RotateCcw className="h-4 w-4" />
            重置
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4" />
            保存
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
