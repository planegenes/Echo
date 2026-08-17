import { useEffect, useMemo, useRef, useState } from 'react'
import type { AiProvider } from '@/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { fetchModelsGroupedByProvider } from '@/lib/ai'
import { Loader2, RefreshCw } from 'lucide-react'

export interface ModelSelectorProps {
  /** 当前选中的模型名 */
  value: string
  /** 模型变更回调 */
  onChange: (model: string) => void
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

  // 合并「缓存的 provider.models」+「已拉取的 fetchedGroups」去重
  const mergedGroups = useMemo(() => {
    const groups: { provider: AiProvider; models: string[] }[] = []
    const seen = new Set<string>()
    for (const p of providers) {
      if (p.models && p.models.length > 0) {
        const models = p.models.filter((m) => {
          if (seen.has(m)) return false
          seen.add(m)
          return true
        })
        if (models.length > 0) groups.push({ provider: p, models })
      }
    }
    for (const g of fetchedGroups) {
      const existing = groups.find((mg) => mg.provider.id === g.provider.id)
      if (existing) {
        for (const m of g.models) {
          if (!seen.has(m)) {
            seen.add(m)
            existing.models.push(m)
          }
        }
      } else {
        const filtered = g.models.filter((m) => {
          if (seen.has(m)) return false
          seen.add(m)
          return true
        })
        if (filtered.length > 0) {
          groups.push({ provider: g.provider, models: filtered })
        }
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
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || loading}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        {allowEmpty && <option value="">{emptyLabel}</option>}
        {!allowEmpty && !value && (
          <option value="">{placeholder ?? '请选择模型'}</option>
        )}
        {hasModels ? (
          mergedGroups.map((g) => (
            <optgroup key={g.provider.id} label={g.provider.name}>
              {g.models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </optgroup>
          ))
        ) : (
          // 无模型：仅显示占位，不展示无效的当前值
          <option value="">{placeholder ?? '请选择模型'}</option>
        )}
      </select>
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
