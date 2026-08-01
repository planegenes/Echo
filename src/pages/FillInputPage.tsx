import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { FillInputGame } from '@/components/FillInputGame'
import { TopicSelector } from '@/components/TopicSelector'
import { Label } from '@/components/ui/label'
import { useTexts } from '@/hooks/useTexts'
import { countBlanks } from '@/lib/parser'

/**
 * 填空模式页面（输入 + AI 评判）
 * - URL /fill/input/:textId 直接进入对应文本
 * - 否则提供文本选择器（来自活动专题）
 */
export default function FillInputPage() {
  const params = useParams<{ textId: string }>()
  const urlTextId = params.textId ?? null
  const textsApi = useTexts()
  const [selectedId, setSelectedId] = useState<string | null>(urlTextId)

  const effectiveId = urlTextId ?? selectedId

  return (
    <AppShell title="填空（输入）" extra={<TopicSelector type="texts" />}>
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

        <FillInputGame textId={effectiveId} />
      </div>
    </AppShell>
  )
}
