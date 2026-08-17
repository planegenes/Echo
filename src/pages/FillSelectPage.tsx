import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { FillSelectGame } from '@/components/FillSelectGame'
import { TopicSelector } from '@/components/TopicSelector'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useTexts } from '@/hooks/useTexts'
import { countBlanks } from '@/lib/parser'

/**
 * 选词填空页面
 * - URL /fill/select/:textId 直接进入对应文本
 * - 否则提供文本选择器（来自活动专题）
 */
export default function FillSelectPage() {
  const params = useParams<{ textId: string }>()
  const urlTextId = params.textId ?? null
  const textsApi = useTexts()
  const [selectedId, setSelectedId] = useState<string | null>(urlTextId)

  const effectiveId = urlTextId ?? selectedId

  return (
    <AppShell title="选词填空" extra={<TopicSelector type="texts" />}>
      <div className="space-y-4">
        {!urlTextId && (
          <div className="space-y-1.5">
            <Label htmlFor="text-picker">选择文本</Label>
            <Select
              value={effectiveId ?? ''}
              onChange={(v) => setSelectedId(v || null)}
              placeholder="请选择..."
              options={[
                ...textsApi.texts.map((t) => {
                  const blankCount = countBlanks(t.content)
                  return {
                    value: t.id,
                    disabled: blankCount === 0,
                    label: `${t.content.slice(0, 30)}${t.content.length > 30 ? '...' : ''}（${blankCount} 空白）`,
                  }
                }),
              ]}
            />
          </div>
        )}

        <FillSelectGame textId={effectiveId} />
      </div>
    </AppShell>
  )
}
