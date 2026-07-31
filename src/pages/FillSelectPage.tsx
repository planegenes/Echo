import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { FillSelectGame } from '@/components/FillSelectGame'
import { Label } from '@/components/ui/label'
import { useTexts } from '@/hooks/useTexts'
import { countBlanks } from '@/lib/parser'

/**
 * 选词填空页面
 * - URL /fill/select/:textId 直接进入对应文本
 * - 否则提供文本选择器
 */
export default function FillSelectPage() {
  const params = useParams<{ textId: string }>()
  const urlTextId = params.textId ?? null
  const textsApi = useTexts()
  const [selectedId, setSelectedId] = useState<string | null>(urlTextId)

  // URL 中携带 textId 时优先使用
  const effectiveId = urlTextId ?? selectedId

  return (
    <AppShell title="选词填空">
      <div className="space-y-4">
        {!urlTextId && (
          <div className="space-y-1.5">
            <Label htmlFor="text-picker">选择文本</Label>
            <select
              id="text-picker"
              value={effectiveId ?? ''}
              onChange={(e) => setSelectedId(e.target.value || null)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">请选择...</option>
              {textsApi.texts.map((t) => {
                const blankCount = countBlanks(t.content)
                return (
                  <option key={t.id} value={t.id} disabled={blankCount === 0}>
                    {t.content.slice(0, 30)}
                    {t.content.length > 30 ? '...' : ''}（{blankCount} 空白）
                  </option>
                )
              })}
            </select>
          </div>
        )}

        <FillSelectGame textId={effectiveId} />
      </div>
    </AppShell>
  )
}
