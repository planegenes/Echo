import { useRef, useState } from 'react'
import type { Topic } from '@/types'
import { Button } from '@/components/ui/button'
import {
  Download,
  Upload,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import {
  buildSnapshot,
  downloadSnapshot,
  ensureIds,
  parseSnapshot,
} from '@/lib/importExport'

export interface ImportExportPanelProps {
  topics: Topic[]
  onImport: (topics: Topic[]) => void | Promise<void>
  onRestoreDefaults: () => void | Promise<void>
}

type Notice =
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }
  | null

/**
 * JSON 导入导出面板
 * - 导出当前所有专题为 JSON 文件
 * - 从文件导入，自动校验（zod），兼容旧版 pairs/texts 格式
 * - 恢复默认数据
 */
export function ImportExportPanel({
  topics,
  onImport,
  onRestoreDefaults,
}: ImportExportPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [notice, setNotice] = useState<Notice>(null)

  const handleExport = () => {
    const snapshot = buildSnapshot(topics)
    downloadSnapshot(snapshot)
    setNotice({ kind: 'success', message: '已导出 JSON 文件' })
  }

  const handleImportFile = async (file: File) => {
    const result = await parseSnapshot(await file.text().then((t) => JSON.parse(t)))
    if (!result.ok || !result.data) {
      setNotice({ kind: 'error', message: `导入失败：${result.error ?? '未知错误'}` })
      return
    }
    const normalized = ensureIds(result.data)
    try {
      await onImport(normalized.topics)
      const totalPairs = normalized.topics.reduce((s, t) => s + t.pairs.length, 0)
      const totalTexts = normalized.topics.reduce((s, t) => s + t.texts.length, 0)
      setNotice({
        kind: 'success',
        message: `已导入 ${normalized.topics.length} 个专题（${totalPairs} 组配对、${totalTexts} 段文本）`,
      })
    } catch (err) {
      setNotice({
        kind: 'error',
        message: `导入失败：${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="text-sm font-medium">导入 / 导出</div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4" />
          导出 JSON
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          导入 JSON
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleImportFile(f)
            e.target.value = ''
          }}
        />
      </div>

      <div className="flex flex-wrap gap-2 border-t pt-3">
        <Button variant="ghost" size="sm" onClick={() => onRestoreDefaults()}>
          <RotateCcw className="h-4 w-4" />
          恢复默认题库
        </Button>
      </div>

      {notice && (
        <div
          className={
            'flex items-start gap-2 rounded-md border px-3 py-2 text-sm ' +
            (notice.kind === 'success'
              ? 'border-success/40 bg-success/10 text-success'
              : 'border-destructive/40 bg-destructive/10 text-destructive')
          }
        >
          {notice.kind === 'success' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4" />
          )}
          <span>{notice.message}</span>
        </div>
      )}
    </div>
  )
}
