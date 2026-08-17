import { useRef, useState } from 'react'
import { useStore } from 'jotai'
import type { Topic } from '@/types'
import { Button } from '@/components/ui/button'
import {
  Download,
  Upload,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  ClipboardCopy,
  ClipboardPaste,
  HardDrive,
} from 'lucide-react'
import {
  buildSnapshot,
  copySnapshotToClipboard,
  downloadSnapshot,
  ensureIds,
  isClipboardApiAvailable,
  parseSnapshot,
  readSnapshotFromClipboard,
} from '@/lib/importExport'
import { buildBackup, downloadBackup, parseBackup } from '@/lib/backup'
import { settingsAtom, persistSettings } from '@/store/atoms'
import { pointsAtom } from '@/store/points'
import { dailyStreakAtom, dayLogsAtom } from '@/store/dailyStreak'
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

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
  const store = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const backupFileRef = useRef<HTMLInputElement>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [pasteDialogOpen, setPasteDialogOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')

  const handleExport = () => {
    const snapshot = buildSnapshot(topics)
    downloadSnapshot(snapshot)
    setNotice({ kind: 'success', message: '已导出 JSON 文件' })
  }

  const handleCopyToClipboard = async () => {
    try {
      await copySnapshotToClipboard(topics)
      setNotice({ kind: 'success', message: '已复制到剪贴板' })
    } catch (err) {
      setNotice({
        kind: 'error',
        message: `复制失败：${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  const handleImportFromClipboard = async () => {
    if (!isClipboardApiAvailable()) {
      setPasteText('')
      setPasteDialogOpen(true)
      return
    }
    await doImportFromClipboard()
  }

  const doImportFromClipboard = async (text?: string) => {
    try {
      const result = text
        ? parseSnapshot(JSON.parse(text))
        : await readSnapshotFromClipboard()
      if (!result.ok || !result.data) {
        setNotice({ kind: 'error', message: `导入失败：${result.error ?? '剪贴板内容不是有效的快照'}` })
        return
      }
      const normalized = ensureIds(result.data)
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

  const handlePasteConfirm = () => {
    if (!pasteText.trim()) {
      setNotice({ kind: 'error', message: '请粘贴 JSON 内容' })
      return
    }
    setPasteDialogOpen(false)
    void doImportFromClipboard(pasteText)
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

  const handleExportBackup = () => {
    const backup = buildBackup(
      topics,
      store.get(pointsAtom),
      store.get(dailyStreakAtom),
      store.get(dayLogsAtom),
      store.get(settingsAtom),
    )
    downloadBackup(backup)
    setNotice({
      kind: 'success',
      message: '已导出完整备份（含题库、进度与设置/API 配置）',
    })
  }

  const handleImportBackupFile = async (file: File) => {
    try {
      const result = parseBackup(JSON.parse(await file.text()))
      if (!result.ok) {
        setNotice({ kind: 'error', message: `导入备份失败：${result.error}` })
        return
      }
      const backup = result.data
      // 恢复题库
      await onImport(backup.topics)
      // 恢复积分与打卡日志
      if (backup.points) store.set(pointsAtom, backup.points)
      if (backup.dayLogs) store.set(dayLogsAtom, backup.dayLogs)
      // 恢复设置（含 AI 供应商、WebDAV 凭据）
      if (backup.settings) {
        store.set(settingsAtom, backup.settings)
        await persistSettings(backup.settings)
        document.documentElement.classList.toggle('dark', backup.settings.darkMode)
      }
      setNotice({
        kind: 'success',
        message: `已恢复备份：${backup.topics.length} 个专题${backup.settings ? '、设置' : ''}`, 
      })
    } catch (err) {
      setNotice({
        kind: 'error',
        message: `导入备份失败：${err instanceof Error ? err.message : String(err)}`,
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
        <Button variant="outline" size="sm" onClick={handleCopyToClipboard}>
          <ClipboardCopy className="h-4 w-4" />
          复制到剪贴板
        </Button>
        <Button variant="outline" size="sm" onClick={handleImportFromClipboard}>
          <ClipboardPaste className="h-4 w-4" />
          从剪贴板导入
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

      {/* 完整备份（含设置，区别于 WebDAV 同步快照） */}
      <div className="space-y-2 border-t pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <HardDrive className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">完整备份</span>
          <span className="text-xs text-muted-foreground">
            包含题库、学习进度、设置与 API 供应商配置（含密钥），请妥善保管
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleExportBackup}>
            <Download className="h-4 w-4" />
            导出备份
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => backupFileRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            导入备份
          </Button>
          <input
            ref={backupFileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleImportBackupFile(f)
              e.target.value = ''
            }}
          />
        </div>
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

      <Dialog open={pasteDialogOpen} onOpenChange={setPasteDialogOpen}>
        <DialogHeader>
          <DialogTitle>手动粘贴</DialogTitle>
        </DialogHeader>
        <p className="mb-3 text-sm text-muted-foreground">
          当前环境不支持直接读取剪贴板，请将 JSON 内容粘贴到下方文本框中。
        </p>
        <textarea
          className="w-full min-h-[200px] rounded-md border bg-background px-3 py-2 text-sm font-mono resize-y"
          placeholder="在此粘贴 JSON 内容..."
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
        />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setPasteDialogOpen(false)}>取消</Button>
          <Button size="sm" onClick={handlePasteConfirm}>确认导入</Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}
