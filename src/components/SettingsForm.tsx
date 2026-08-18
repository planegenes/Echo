import { useEffect, useRef, useState } from 'react'
import type { AiApiFormat, AiProvider, AppSettings, ModelConfig } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { ModelSelector } from '@/components/ModelSelector'
import { ModelConfigEditor } from '@/components/ModelConfigEditor'
import {
  AI_PROVIDER_PRESETS,
  createProviderFromPreset,
  detectThinkingStyle,
  findPreset,
  getModelConfig,
} from '@/lib/ai-providers'
import { refreshProviderModels } from '@/lib/ai'
import {
  Eye,
  EyeOff,
  Volume2,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  Star,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Loader2,
  Cloud,
  Check,
  AlertCircle,
} from 'lucide-react'

export interface SettingsFormProps {
  settings: AppSettings
  onSubmit: (patch: Partial<AppSettings>) => void | Promise<void>
  onReset: () => void | Promise<void>
}

/**
 * 应用设置表单
 * - 音效开关（主题切换在顶栏）
 * - AI 供应商管理（多供应商 + OpenAI/Responses API 双格式）
 * - 默认 AI 模型选择（按供应商分组）
 */
export function SettingsForm({
  settings,
  onSubmit,
  onReset,
}: SettingsFormProps) {
  const [form, setForm] = useState<AppSettings>(settings)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showAddPreset, setShowAddPreset] = useState(false)
  const [expandedProviderId, setExpandedProviderId] = useState<string | null>(null)
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [refreshingProviderId, setRefreshingProviderId] = useState<string | null>(null)
  const [refreshErrors, setRefreshErrors] = useState<Record<string, string>>({})
  const [showWebdavPass, setShowWebdavPass] = useState(false)
  /** 首次配置 WebDAV 的备份确认弹窗 */
  const [webdavFirstOpen, setWebdavFirstOpen] = useState(false)
  const patch = (p: Partial<AppSettings>) =>
    setForm((cur) => ({ ...cur, ...p }))

  useEffect(() => {
    return () => {
      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current)
    }
  }, [])

  const handleSave = async () => {
    // 首次设置 WebDAV（原地址为空，现在填写）时先确认已做备份
    const isFirstWebdav =
      !settings.webdavUrl && form.webdavUrl.trim().length > 0
    if (isFirstWebdav) {
      setWebdavFirstOpen(true)
      return
    }
    await doSave()
  }

  const doSave = async () => {
    setSaving(true)
    setSaveStatus('idle')
    if (saveStatusTimerRef.current) {
      clearTimeout(saveStatusTimerRef.current)
      saveStatusTimerRef.current = null
    }
    try {
      await onSubmit(form)
      setSaveStatus('success')
      saveStatusTimerRef.current = setTimeout(() => {
        setSaveStatus('idle')
        saveStatusTimerRef.current = null
      }, 1500)
    } catch (e) {
      setSaveStatus('error')
      console.error('保存设置失败', e)
    } finally {
      setSaving(false)
    }
  }

  // ===== 供应商管理 =====

  const handleAddProvider = (presetId: string) => {
    const preset = findPreset(presetId)
    if (!preset) return
    const provider = createProviderFromPreset(preset)
    const next = [...form.aiProviders, provider]
    const becomesDefault = !form.defaultAiProviderId
    patch({
      aiProviders: next,
      defaultAiProviderId: becomesDefault ? provider.id : form.defaultAiProviderId,
      // 首个供应商成为默认时，同步默认模型为该预设推荐模型，
      // 避免默认模型仍是旧值（如 gpt-4o-mini）导致调用时传错模型
      defaultAiModel:
        becomesDefault && preset.defaultModel
          ? preset.defaultModel
          : form.defaultAiModel,
    })
    setExpandedProviderId(provider.id)
    setShowAddPreset(false)
  }

  /** 拉取某供应商的模型列表并更新到 form */
  const handleRefreshModels = async (providerId: string) => {
    const provider = form.aiProviders.find((p) => p.id === providerId)
    if (!provider) return
    setRefreshingProviderId(providerId)
    setRefreshErrors((prev) => ({ ...prev, [providerId]: '' }))
    try {
      const { provider: updated, error } = await refreshProviderModels(provider)
      if (error) {
        setRefreshErrors((prev) => ({ ...prev, [providerId]: error }))
      } else {
        handleUpdateProvider(providerId, { models: updated.models })
      }
    } finally {
      setRefreshingProviderId(null)
    }
  }

  /** 更新某供应商中某模型的配置 */
  const handleUpdateModelConfig = (
    providerId: string,
    modelId: string,
    config: ModelConfig,
  ) => {
    const provider = form.aiProviders.find((p) => p.id === providerId)
    if (!provider) return
    handleUpdateProvider(providerId, {
      modelConfigs: {
        ...provider.modelConfigs,
        [modelId]: config,
      },
    })
  }

  const handleUpdateProvider = (id: string, updates: Partial<AiProvider>) => {
    patch({
      aiProviders: form.aiProviders.map((p) =>
        p.id === id ? { ...p, ...updates } : p,
      ),
    })
  }

  const handleDeleteProvider = (id: string) => {
    const next = form.aiProviders.filter((p) => p.id !== id)
    const nextDefault =
      form.defaultAiProviderId === id
        ? (next[0]?.id ?? null)
        : form.defaultAiProviderId
    patch({ aiProviders: next, defaultAiProviderId: nextDefault })
  }

  const handleSetDefault = (id: string) => {
    const provider = form.aiProviders.find((p) => p.id === id)
    if (!provider) return
    const preset = provider.presetId ? findPreset(provider.presetId) : undefined
    // 切换默认供应商时同步默认模型，避免默认模型仍是旧供应商的模型
    const nextModel = preset?.defaultModel ?? provider.models?.[0] ?? form.defaultAiModel
    patch({
      defaultAiProviderId: id,
      defaultAiModel: nextModel,
    })
  }

  const toggleShowKey = (id: string) => {
    setShowKeys((cur) => ({ ...cur, [id]: !cur[id] }))
  }

  const toggleExpand = (id: string) => {
    setExpandedProviderId((cur) => (cur === id ? null : id))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">应用设置</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 音效 */}
        <div className="flex items-center justify-between rounded-md border p-3">
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4" />
            <div>
              <Label>音效</Label>
              <p className="text-xs text-muted-foreground">操作反馈音效</p>
            </div>
          </div>
          <Switch
            checked={form.soundEnabled}
            onCheckedChange={(v) => patch({ soundEnabled: v })}
          />
        </div>

        {/* 深色模式开关已移除：主题切换统一使用顶栏的太阳/月亮按钮（立即生效） */}

        {/* AI 供应商管理 */}
        <div className="space-y-3 rounded-md border p-3">
          <div className="flex items-center justify-between">
            <div>
              <Label>AI 供应商管理</Label>
              <p className="text-xs text-muted-foreground">
                支持多个 OpenAI 兼容 / Responses API 供应商
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAddPreset((s) => !s)}
            >
              <Plus className="h-4 w-4" />
              添加供应商
            </Button>
          </div>

          {/* 预设供应商列表 */}
          {showAddPreset && (
            <div className="rounded-md border bg-muted/20 p-2">
              <p className="mb-2 text-xs text-muted-foreground">
                选择常见供应商快速添加，或选「自定义」填写任意端点
              </p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {AI_PROVIDER_PRESETS.map((preset) => (
                  <button
                    key={preset.presetId}
                    type="button"
                    onClick={() => handleAddProvider(preset.presetId)}
                    className="rounded-md border bg-background px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent"
                  >
                    <div className="font-medium">{preset.name}</div>
                    {preset.defaultModel && (
                      <div className="text-muted-foreground truncate">
                        {preset.defaultModel}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 已配置供应商列表 */}
          {form.aiProviders.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              尚未添加 AI 供应商。点击「添加供应商」选择预设或自定义。
            </div>
          ) : (
            <div className="space-y-2">
              {form.aiProviders.map((provider) => {
                const isDefault = form.defaultAiProviderId === provider.id
                const expanded = expandedProviderId === provider.id
                const showKey = showKeys[provider.id] ?? false
                return (
                  <div
                    key={provider.id}
                    className={
                      'rounded-md border ' +
                      (isDefault ? 'border-primary/60' : '')
                    }
                  >
                    {/* 供应商卡片头部 */}
                    <div className="flex items-center gap-2 p-2">
                      <button
                        type="button"
                        onClick={() => handleSetDefault(provider.id)}
                        title={isDefault ? '当前为默认供应商' : '设为默认供应商'}
                        className={
                          'shrink-0 rounded p-1 ' +
                          (isDefault
                            ? 'text-primary'
                            : 'text-muted-foreground hover:text-foreground')
                        }
                      >
                        <Star
                          className="h-4 w-4"
                          fill={isDefault ? 'currentColor' : 'none'}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleExpand(provider.id)}
                        className="flex min-w-0 flex-1 items-center justify-between gap-1 text-left"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {provider.name || '未命名供应商'}
                            {isDefault && (
                              <span className="ml-1.5 text-xs text-primary">
                                默认
                              </span>
                            )}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {provider.baseUrl || '未配置 baseUrl'}
                            <span className="ml-1.5">
                              · {formatLabel(provider.apiFormat)}
                            </span>
                          </div>
                        </div>
                        {expanded ? (
                          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={() => handleDeleteProvider(provider.id)}
                        title="删除供应商"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>

                    {/* 展开后的详细配置 */}
                    {expanded && (
                      <>
                      <div className="space-y-2 border-t p-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">
                            显示名称
                          </Label>
                          <Input
                            value={provider.name}
                            onChange={(e) =>
                              handleUpdateProvider(provider.id, {
                                name: e.target.value,
                              })
                            }
                            placeholder="例如 我的 OpenAI"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">
                            API 格式
                          </Label>
                          <ApiFormatToggle
                            value={provider.apiFormat}
                            onChange={(fmt) =>
                              handleUpdateProvider(provider.id, { apiFormat: fmt })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">
                            Base URL
                          </Label>
                          <Input
                            value={provider.baseUrl}
                            onChange={(e) =>
                              handleUpdateProvider(provider.id, {
                                baseUrl: e.target.value,
                              })
                            }
                            placeholder="https://api.openai.com/v1"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">
                            API Key
                          </Label>
                          <div className="flex items-center gap-1">
                            <Input
                              type={showKey ? 'text' : 'password'}
                              value={provider.apiKey}
                              onChange={(e) =>
                                handleUpdateProvider(provider.id, {
                                  apiKey: e.target.value,
                                })
                              }
                              placeholder="sk-..."
                              autoComplete="off"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => toggleShowKey(provider.id)}
                              title={showKey ? '隐藏' : '显示'}
                            >
                              {showKey ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* 模型列表 + 配置 */}
                      <div className="space-y-1.5 border-t p-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs text-muted-foreground">
                            模型列表（{provider.models?.length ?? 0}）
                          </Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleRefreshModels(provider.id)}
                            disabled={
                              refreshingProviderId === provider.id ||
                              !provider.baseUrl.trim() ||
                              !provider.apiKey.trim()
                            }
                            title="从接口拉取模型列表"
                          >
                            {refreshingProviderId === provider.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                            刷新模型
                          </Button>
                        </div>
                        {refreshErrors[provider.id] && (
                          <p className="text-xs text-destructive">
                            刷新失败：{refreshErrors[provider.id]}
                          </p>
                        )}
                        {(!provider.models || provider.models.length === 0) ? (
                          <p className="rounded-md border border-dashed p-2 text-center text-xs text-muted-foreground">
                            暂无模型列表，点击「刷新模型」从接口获取
                          </p>
                        ) : (
                          <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
                            {provider.models.map((modelId) => {
                              const config = getModelConfig(provider, modelId)
                              const thinkingStyle = detectThinkingStyle(provider, modelId)
                              const thinkingHint =
                                thinkingStyle === 'reasoning_effort'
                                  ? 'reasoning_effort'
                                  : thinkingStyle === 'thinking_object'
                                    ? 'thinking 对象'
                                    : '不支持思考'
                              return (
                                <ModelConfigEditor
                                  key={modelId}
                                  modelId={modelId}
                                  config={config}
                                  thinkingStyleHint={thinkingHint}
                                  onChange={(c) =>
                                    handleUpdateModelConfig(provider.id, modelId, c)
                                  }
                                />
                              )
                            })}
                          </div>
                        )}
                      </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            配置仅保存在本地 IndexedDB 与 localStorage，不会上传服务器。
          </p>
        </div>

        {/* 默认 AI 模型 */}
        <div className="space-y-2 rounded-md border p-3">
          <Label>默认 AI 模型</Label>
          <p className="text-xs text-muted-foreground">
            题目未单独指定模型时使用此默认值。点击右侧刷新按钮从所有供应商获取模型列表，按供应商分组显示。
          </p>
          <ModelSelector
            value={form.defaultAiModel}
            onChange={(m) => patch({ defaultAiModel: m })}
            providers={form.aiProviders}
            placeholder="选择或输入默认模型"
          />
        </div>

        {/* WebDAV 同步 */}
        <div className="space-y-2 rounded-md border p-3">
          <div className="flex items-center gap-2">
            <Cloud className="h-4 w-4" />
            <Label>WebDAV 同步</Label>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">WebDAV 地址</Label>
            <Input
              value={form.webdavUrl}
              onChange={(e) => patch({ webdavUrl: e.target.value })}
              placeholder="https://dav.example.com/echo"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">用户名</Label>
            <Input
              value={form.webdavUsername}
              onChange={(e) => patch({ webdavUsername: e.target.value })}
              placeholder="WebDAV 用户名"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">密码</Label>
            <div className="flex items-center gap-1">
              <Input
                type={showWebdavPass ? 'text' : 'password'}
                value={form.webdavPassword}
                onChange={(e) => patch({ webdavPassword: e.target.value })}
                placeholder="WebDAV 密码"
                autoComplete="off"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowWebdavPass((s) => !s)}
                title={showWebdavPass ? '隐藏' : '显示'}
              >
                {showWebdavPass ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            配置后，每次打开应用自动拉取，修改后自动推送同步。
          </p>
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={() => onReset()} disabled={saving}>
            <RotateCcw className="h-4 w-4" />
            重置
          </Button>
          <div className="flex items-center gap-2">
            {saveStatus === 'success' && (
              <span className="flex items-center gap-1 text-sm text-success">
                <Check className="h-4 w-4" />
                已保存
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="flex items-center gap-1 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                保存失败
              </span>
            )}
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              保存
            </Button>
          </div>
        </div>
      </CardContent>

      {/* 首次配置 WebDAV：确认已做完整备份 */}
      <Dialog open={webdavFirstOpen} onOpenChange={setWebdavFirstOpen}>
        <DialogHeader>
          <DialogTitle>首次配置 WebDAV 同步</DialogTitle>
          <DialogDescription>
            开始同步前，建议先在题库管理页导出<b>完整备份</b>
            （包含题库、学习进度、设置与 API 供应商配置）保存到本地，
            以防同步过程中误覆盖数据。是否已确认做好备份？
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setWebdavFirstOpen(false)}
          >
            先取消
          </Button>
          <Button
            onClick={() => {
              setWebdavFirstOpen(false)
              void doSave()
            }}
          >
            已备份，继续保存
          </Button>
        </DialogFooter>
      </Dialog>
    </Card>
  )
}

function formatLabel(format: AiApiFormat): string {
  return format === 'responses' ? 'Responses API' : 'OpenAI 兼容'
}

function ApiFormatToggle({
  value,
  onChange,
}: {
  value: AiApiFormat
  onChange: (fmt: AiApiFormat) => void
}) {
  const options: { value: AiApiFormat; label: string }[] = [
    { value: 'openai', label: 'OpenAI 兼容' },
    { value: 'responses', label: 'Responses API' },
  ]
  return (
    <div className="inline-flex rounded-md border bg-background p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={
            'rounded px-2 py-0.5 text-xs transition-colors ' +
            (value === opt.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground')
          }
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
