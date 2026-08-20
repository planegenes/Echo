import { useEffect, useMemo, useRef, useState } from 'react'
import type { AiProvider } from '@/types'
import { Button } from '@/components/ui/button'
import { Select, type SelectOption } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { fetchModelsGroupedByProvider } from '@/lib/ai'
import { Loader2, RefreshCw } from 'lucide-react'

export interface ModelSelectorProps {
  /** 当前选中的模型名 */
  value: string
  /** 模型变更回调 */
  onChange: (model: string) => void
  /** 模型变更时同步回调其所属供应商 id（用于保持默认供应商与模型一致） */
  onChangeProvider?: (providerId: string) => void
  /** 用于获取模型列表的供应商 */
  providers: AiProvider[]
  /** 是否允许「使用默认」空选项（用于题目级覆盖） */
  allowEmpty?: boolean
  /** 空选项的显示文案 */
  emptyLabel?: string
  /** 占位提示 */
  placeholder?: string
  disabled?: boolean
  className?: string
}

/**
 * 模型选择器
 * - 优先使用供应商已缓存的 provider.models 列表（在设置页刷新得到）
 * - 若缓存为空，则点击刷新按钮并行从所有供应商拉取并分组
 * - 下拉框按供应商分组（optgroup）
 */
export function ModelSelector({
  value,
  onChange,
  onChangeProvider,
  providers,
  allowEmpty = false,
  emptyLabel = '使用默认',
  placeholder,
  disabled = false,
  className,
}: ModelSelectorProps) {
  const [fetchedGroups, setFetchedGroups] = useState<{ provider: AiProvider; models: string[] }[]>([])
  const [errorCount, setErrorCount] = useState(0)
  const [loading, setLoading] = useState(false)
  // 自动拉取只尝试一次（用 ref 记录，避免 effect 中 setState）
  const autoTriedRef = useRef(false)

  const refresh = async () => {
    if (providers.length === 0) return
    setLoading(true)
    setErrorCount(0)
    try {
      const { groups, errors } = await fetchModelsGroupedByProvider(providers)
      setFetchedGroups(groups)
      setErrorCount(errors.length)
    } finally {
      setLoading(false)
    }
  }

  // providers 变化时重置自动拉取标记（必须先于下方 autoTried 检查 effect 执行）
  useEffect(() => {
    autoTriedRef.current = false
  }, [providers])

  // providers 变化（增删/编辑）时重置已拉取列表（渲染期调整，React 官方 prev-props 模式）
  const [prevProviders, setPrevProviders] = useState(providers)
  if (prevProviders !== providers) {
    setPrevProviders(providers)
    setFetchedGroups([])
    setErrorCount(0)
  }

  // 当所有供应商都没有缓存模型时，自动尝试拉取一次（ref 防重复）
  useEffect(() => {
    if (autoTriedRef.current) return
    const cachedTotal = providers.reduce(
      (sum, p) => sum + (p.models?.length ?? 0),
      0,
    )
    if (cachedTotal > 0) {
      autoTriedRef.current = true
      return
    }
    const ready = providers.filter((p) => p.baseUrl.trim() && p.apiKey.trim())
    if (ready.length === 0) return
    autoTriedRef.current = true
    const timer = setTimeout(() => void refresh(), 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers])

  // 合并「缓存的 provider.models」+「已拉取的 fetchedGroups」，仅同供应商内部去重
  const mergedGroups = useMemo(() => {
    const groups: { provider: AiProvider; models: string[] }[] = []
    for (const p of providers) {
      const models = [...(p.models ?? [])]
      // 追加已拉取的同供应商模型
      const fetched = fetchedGroups.find((g) => g.provider.id === p.id)
      if (fetched) {
        for (const m of fetched.models) {
          if (!models.includes(m)) models.push(m)
        }
      }
      // 仅同供应商内部去重
      const unique: string[] = []
      const seen = new Set<string>()
      for (const m of models) {
        if (!seen.has(m)) { seen.add(m); unique.push(m) }
      }
      if (unique.length > 0) groups.push({ provider: p, models: unique })
    }
    // fetchedGroups 中不在 providers 里的（兜底）
    for (const g of fetchedGroups) {
      if (!groups.find((mg) => mg.provider.id === g.provider.id)) {
        groups.push({ provider: g.provider, models: [...g.models] })
      }
    }
    return groups
  }, [providers, fetchedGroups])

  const allModelIds = useMemo(
    () => new Set(mergedGroups.flatMap((g) => g.models)),
    [mergedGroups],
  )
  const hasModels = mergedGroups.length > 0
  const canRefresh = providers.length > 0 && !loading && !disabled

  // 当前选中模型对应的唯一 compound value（providerId:modelName），
  // 用于下拉精确匹配，避免不同供应商同名模型同时高亮
  const compoundValue = useMemo(() => {
    if (!value) return ''
    const g = mergedGroups.find((grp) => grp.models.includes(value))
    return g ? `${g.provider.id}:${value}` : value
  }, [mergedGroups, value])

  // 当前值不在有效模型中时自动修正：有模型取第一个，无模型清空。
  // 避免下拉框显示不在列表中的无效默认模型（如初始的 gpt-4o-mini）
  useEffect(() => {
    if (!value) return
    if (hasModels && !allModelIds.has(value)) {
      onChange(mergedGroups[0].models[0])
    } else if (!hasModels) {
      onChange('')
    }
  }, [hasModels, allModelIds, value, mergedGroups, onChange])

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Select
        value={compoundValue}
        onChange={(v) => {
          // 从 compound value 中提取模型名与其所属供应商（格式: providerId:modelName）
          const idx = v.indexOf(':')
          const model = idx >= 0 ? v.slice(idx + 1) : v
          const pid = idx >= 0 ? v.slice(0, idx) : ''
          onChange(model)
          if (pid && onChangeProvider) onChangeProvider(pid)
        }}
        isSelected={(opt, v) => opt.value === v}
        placeholder={placeholder ?? '请选择模型'}
        disabled={disabled || loading}
        className="flex-1"
        options={(() => {
          const opts: SelectOption[] = []
          // 允许空选项（题目级覆盖的「使用默认」）
          if (allowEmpty) opts.push({ value: '', label: emptyLabel })
          // 无模型且未选值时提供占位选项
          else if (!hasModels && !value)
            opts.push({ value: '', label: placeholder ?? '请选择模型' })
          // 按供应商分组的模型列表（value 前缀供应商 id 确保唯一，精确匹配选中）
          for (const g of mergedGroups) {
            for (const m of g.models) {
              opts.push({ value: `${g.provider.id}:${m}`, label: m, group: g.provider.name })
            }
          }
          return opts
        })()}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => void refresh()}
        disabled={!canRefresh}
        title="刷新模型列表"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
      </Button>
      {errorCount > 0 && (
        <span className="text-xs text-destructive whitespace-nowrap">
          {errorCount} 失败
        </span>
      )}
    </div>
  )
}
