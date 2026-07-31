import { useEffect, useState } from 'react'
import { AppShell } from '@/components/AppShell'
import { PairList } from '@/components/PairList'
import { PairForm } from '@/components/PairForm'
import { TextList } from '@/components/TextList'
import { TextForm } from '@/components/TextForm'
import { ImportExportPanel } from '@/components/ImportExportPanel'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useDeck } from '@/hooks/useDeck'
import { useTexts } from '@/hooks/useTexts'
import type { PairItem, TextItem } from '@/types'
import { cn } from '@/lib/utils'

type TabKey = 'pairs' | 'texts'

/**
 * 题库管理页面
 * - 同时管理配对（PairItem）和文本（TextItem），用 tab 切换
 * - 首次启动检测 deck/texts 为空 → 加载默认数据
 */
export default function ManagePairsPage() {
  const deckApi = useDeck()
  const textsApi = useTexts()
  const [tab, setTab] = useState<TabKey>('pairs')

  // 配对 Dialog
  const [pairDialogOpen, setPairDialogOpen] = useState(false)
  const [editingPair, setEditingPair] = useState<PairItem | null>(null)

  // 文本 Dialog
  const [textDialogOpen, setTextDialogOpen] = useState(false)
  const [editingText, setEditingText] = useState<TextItem | null>(null)

  const [bootstrapped, setBootstrapped] = useState(false)

  // 首次启动若题库为空 → 加载默认数据
  useEffect(() => {
    if (!bootstrapped) {
      const tasks: Promise<unknown>[] = []
      if (deckApi.deck.length === 0) tasks.push(deckApi.restoreDefaults())
      if (textsApi.texts.length === 0) tasks.push(textsApi.restoreDefaults())
      Promise.all(tasks).then(() => setBootstrapped(true))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrapped])

  // ----- Pair 操作 -----
  const openAddPair = () => {
    setEditingPair(null)
    setPairDialogOpen(true)
  }
  const openEditPair = (pair: PairItem) => {
    setEditingPair(pair)
    setPairDialogOpen(true)
  }
  const handlePairSubmit = async (pair: PairItem) => {
    if (editingPair) await deckApi.update(pair)
    else await deckApi.add(pair)
    setPairDialogOpen(false)
    setEditingPair(null)
  }

  // ----- Text 操作 -----
  const openAddText = () => {
    setEditingText(null)
    setTextDialogOpen(true)
  }
  const openEditText = (text: TextItem) => {
    setEditingText(text)
    setTextDialogOpen(true)
  }
  const handleTextSubmit = async (text: TextItem) => {
    if (editingText) await textsApi.update(text)
    else await textsApi.add(text)
    setTextDialogOpen(false)
    setEditingText(null)
  }

  // ----- 导入导出 -----
  const handleImport = async (pairs: PairItem[], texts: TextItem[]) => {
    await deckApi.replaceAll(pairs)
    await textsApi.replaceAll(texts)
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'pairs', label: `配对 (${deckApi.deck.length})` },
    { key: 'texts', label: `文本 (${textsApi.texts.length})` },
  ]

  return (
    <AppShell title="题库管理">
      <div className="space-y-6">
        {/* Tab 切换 */}
        <div className="inline-flex rounded-md border p-1 bg-muted/30">
          {tabs.map((t) => (
            <Button
              key={t.key}
              variant="ghost"
              size="sm"
              className={cn(
                'rounded-sm px-4',
                tab === t.key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </Button>
          ))}
        </div>

        {/* 当前 tab 内容 */}
        {tab === 'pairs' ? (
          <PairList
            pairs={deckApi.deck}
            onAdd={openAddPair}
            onEdit={openEditPair}
            onDelete={(id) => void deckApi.remove(id)}
            onResetStats={(id) => void deckApi.resetStats(id)}
          />
        ) : (
          <TextList
            texts={textsApi.texts}
            onAdd={openAddText}
            onEdit={openEditText}
            onDelete={(id) => void textsApi.remove(id)}
          />
        )}

        {/* 导入导出（统一管理 pairs + texts） */}
        <ImportExportPanel
          pairs={deckApi.deck}
          texts={textsApi.texts}
          onImport={handleImport}
          onRestorePairs={() => deckApi.restoreDefaults()}
          onRestoreTexts={() => textsApi.restoreDefaults()}
        />
      </div>

      {/* 配对 Dialog */}
      <Dialog
        open={pairDialogOpen}
        onOpenChange={(o) => {
          setPairDialogOpen(o)
          if (!o) setEditingPair(null)
        }}
      >
        <DialogHeader>
          <DialogTitle>{editingPair ? '编辑配对' : '新增配对'}</DialogTitle>
        </DialogHeader>
        <PairForm
          initial={editingPair}
          onSubmit={handlePairSubmit}
          onCancel={() => {
            setPairDialogOpen(false)
            setEditingPair(null)
          }}
        />
        <DialogClose />
      </Dialog>

      {/* 文本 Dialog */}
      <Dialog
        open={textDialogOpen}
        onOpenChange={(o) => {
          setTextDialogOpen(o)
          if (!o) setEditingText(null)
        }}
      >
        <DialogHeader>
          <DialogTitle>{editingText ? '编辑文本' : '新增文本'}</DialogTitle>
        </DialogHeader>
        <TextForm
          initial={editingText}
          onSubmit={handleTextSubmit}
          onCancel={() => {
            setTextDialogOpen(false)
            setEditingText(null)
          }}
        />
        <DialogClose />
      </Dialog>
    </AppShell>
  )
}
