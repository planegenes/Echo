import { useState } from 'react'
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AppShell } from '@/components/AppShell'
import { PairList } from '@/components/PairList'
import { PairForm } from '@/components/PairForm'
import { TextList } from '@/components/TextList'
import { TextForm } from '@/components/TextForm'
import { SentenceList } from '@/components/SentenceList'
import { SentenceForm } from '@/components/SentenceForm'
import { ImportExportPanel } from '@/components/ImportExportPanel'
import { AiGenerateDialog } from '@/components/AiGenerateDialog'
import { AiEditDialog } from '@/components/AiEditDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogClose,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useDeck } from '@/hooks/useDeck'
import { useTexts } from '@/hooks/useTexts'
import { useSentences } from '@/hooks/useSentences'
import { useTopics } from '@/hooks/useTopics'
import { replaceAllTopics } from '@/store/atoms'
import type { PairItem, SentenceItem, TextItem, Topic, TopicType } from '@/types'
import { cn, uid } from '@/lib/utils'
import defaultPairs from '@/presets/default-pairs.json'
import defaultTexts from '@/presets/default-texts.json'
import defaultSentencesZh from '@/presets/default-sentences-zh.json'
import defaultSentencesYue from '@/presets/default-sentences-yue.json'
import defaultSentencesEn from '@/presets/default-sentences-en.json'
import { Plus, FolderPlus, Pencil, Trash2, Check, X } from 'lucide-react'

type TabKey = TopicType

/** 可拖拽的专题 chip（拖动换顺序，点击激活/重命名/删除） */
function SortableTopicChip({
  topic,
  isActive,
  isRenaming,
  renameValue,
  setRenameValue,
  confirmRename,
  cancelRename,
  itemCount,
  canDelete,
  onActivate,
  onStartRename,
  onDelete,
}: {
  topic: Topic
  isActive: boolean
  isRenaming: boolean
  renameValue: string
  setRenameValue: (v: string) => void
  confirmRename: () => void
  cancelRename: () => void
  itemCount: number
  canDelete: boolean
  onActivate: () => void
  onStartRename: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: topic.id, disabled: isRenaming })
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm transition-colors',
        isActive
          ? 'border-primary bg-accent text-foreground'
          : 'border-border bg-card text-muted-foreground hover:text-foreground',
        isDragging && 'z-10 shadow-lg opacity-90',
      )}
      {...attributes}
      {...listeners}
    >
      {isRenaming ? (
        <>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmRename()
              if (e.key === 'Escape') cancelRename()
            }}
            className="h-6 w-32 px-1 text-sm"
            autoFocus
          />
          <button
            type="button"
            onClick={confirmRename}
            className="text-primary hover:text-primary/80"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={cancelRename}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={onActivate}
            className="font-medium"
          >
            {topic.name}
          </button>
          <span className="text-xs opacity-60">({itemCount})</span>
          <button
            type="button"
            onClick={onStartRename}
            className="ml-1 text-muted-foreground hover:text-foreground"
            title="重命名"
          >
            <Pencil className="h-3 w-3" />
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="text-muted-foreground hover:text-destructive"
              title="删除"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </>
      )}
    </div>
  )
}

/**
 * 题库管理页面
 * - 配对专题 / 填空专题 两个 Tab
 * - 每个 Tab 内可切换同类型专题，增删改名
 * - 导入导出覆盖所有专题
 */
export default function ManagePairsPage() {
  const topicsApi = useTopics()
  const deckApi = useDeck()
  const textsApi = useTexts()
  const sentencesApi = useSentences()
  const [tab, setTab] = useState<TabKey>('pairs')

  // 配对 Dialog
  const [pairDialogOpen, setPairDialogOpen] = useState(false)
  const [editingPair, setEditingPair] = useState<PairItem | null>(null)

  // 文本 Dialog
  const [textDialogOpen, setTextDialogOpen] = useState(false)
  const [editingText, setEditingText] = useState<TextItem | null>(null)

  // 组句 Dialog
  const [sentenceDialogOpen, setSentenceDialogOpen] = useState(false)
  const [editingSentence, setEditingSentence] = useState<SentenceItem | null>(null)

  // AI 批量生成 Dialog
  const [aiDialogOpen, setAiDialogOpen] = useState(false)

  // AI 修改题库 Dialog
  const [aiEditOpen, setAiEditOpen] = useState(false)

  // 新增专题 Dialog
  const [topicDialogOpen, setTopicDialogOpen] = useState(false)
  const [newTopicName, setNewTopicName] = useState('')
  const [newTopicType, setNewTopicType] = useState<TopicType>('pairs')

  // 重命名 inline
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const { topics } = topicsApi
  const tabTopics = topics.filter((t) => t.type === tab)
  const activeTopicId =
    tab === 'pairs'
      ? topicsApi.activePairsTopicId
      : tab === 'texts'
        ? topicsApi.activeTextsTopicId
        : topicsApi.activeSentencesTopicId
  const setActiveTopicId =
    tab === 'pairs'
      ? topicsApi.setActivePairsTopicId
      : tab === 'texts'
        ? topicsApi.setActiveTextsTopicId
        : topicsApi.setActiveSentencesTopicId
  const activeTopic = tabTopics.find((t) => t.id === activeTopicId) ?? tabTopics[0] ?? null

  // 专题拖拽排序
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 4 } }),
  )

  const handleTopicDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = tabTopics.findIndex((t) => t.id === String(active.id))
    const to = tabTopics.findIndex((t) => t.id === String(over.id))
    if (from === -1 || to === -1) return
    const nextTab = [...tabTopics]
    const [moved] = nextTab.splice(from, 1)
    nextTab.splice(to, 0, moved)
    // 当前类型按新顺序排前，其他类型保持原相对顺序
    const orderMap = new Map(nextTab.map((t, i) => [t.id, i]))
    const result = [...topics].sort((a, b) => {
      const ai = orderMap.get(a.id)
      const bi = orderMap.get(b.id)
      if (ai === undefined && bi === undefined) return 0
      if (ai === undefined) return 1
      if (bi === undefined) return -1
      return ai - bi
    })
    void topicsApi.reorderTopics(result)
  }

  // ----- Topic 操作 -----
  const openAddTopic = (type: TopicType) => {
    setNewTopicType(type)
    setNewTopicName('')
    setTopicDialogOpen(true)
  }

  const handleAddTopic = async () => {
    const name = newTopicName.trim()
    if (!name) return
    await topicsApi.addTopic(name, newTopicType)
    setNewTopicName('')
    setTopicDialogOpen(false)
  }

  const startRename = (topic: Topic) => {
    setRenamingId(topic.id)
    setRenameValue(topic.name)
  }

  const confirmRename = async () => {
    if (!renamingId) return
    const name = renameValue.trim()
    if (name) await topicsApi.renameTopic(renamingId, name)
    setRenamingId(null)
    setRenameValue('')
  }

  const handleDeleteTopic = async (topic: Topic) => {
    const sameType = topics.filter((t) => t.type === topic.type)
    if (sameType.length <= 1) return
    if (!confirm(`确定删除专题「${topic.name}」？其中所有题目将一并删除。`)) return
    await topicsApi.removeTopic(topic.id)
  }

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

  // ----- Sentence 操作 -----
  const openAddSentence = () => {
    setEditingSentence(null)
    setSentenceDialogOpen(true)
  }
  const openEditSentence = (sentence: SentenceItem) => {
    setEditingSentence(sentence)
    setSentenceDialogOpen(true)
  }
  const handleSentenceSubmit = async (sentence: SentenceItem) => {
    if (editingSentence) await sentencesApi.update(sentence)
    else await sentencesApi.add(sentence)
    setSentenceDialogOpen(false)
    setEditingSentence(null)
  }

  // ----- AI 批量生成 -----
  const openAiGenerate = () => {
    setAiDialogOpen(true)
  }

  const handleAiConfirm = async (
    items: PairItem[] | TextItem[] | SentenceItem[],
  ) => {
    if (tab === 'pairs') {
      await deckApi.mergeImport(items as PairItem[])
    } else if (tab === 'texts') {
      await textsApi.mergeImport(items as TextItem[])
    } else {
      await sentencesApi.mergeImport(items as SentenceItem[])
    }
  }

  // ----- AI 修改题库 -----
  const openAiEdit = () => {
    setAiEditOpen(true)
  }

  const handleAiEditApply = async (
    items: PairItem[] | TextItem[] | SentenceItem[],
  ) => {
    if (tab === 'pairs') {
      await deckApi.replaceAll(items as PairItem[])
    } else if (tab === 'texts') {
      await textsApi.replaceAll(items as TextItem[])
    } else {
      await sentencesApi.replaceAll(items as SentenceItem[])
    }
  }

  const aiEditItems =
    tab === 'pairs'
      ? deckApi.deck
      : tab === 'texts'
        ? textsApi.texts
        : sentencesApi.sentences

  // ----- 导入导出 -----
  const handleImport = async (newTopics: Topic[]) => {
    await replaceAllTopics(newTopics)
  }

  const handleRestoreDefaults = async () => {
    const pairsTopic: Topic = {
      id: uid('topic'),
      name: '测试题库（配对）',
      type: 'pairs',
      pairs: defaultPairs as PairItem[],
      texts: [],
      sentences: [],
    }
    const textsTopic: Topic = {
      id: uid('topic'),
      name: '测试题库（填空）',
      type: 'texts',
      pairs: [],
      texts: defaultTexts as TextItem[],
      sentences: [],
    }
    const sentencesZhTopic: Topic = {
      id: uid('topic'),
      name: '普通话组句',
      type: 'sentences',
      pairs: [],
      texts: [],
      sentences: defaultSentencesZh as SentenceItem[],
    }
    const sentencesYueTopic: Topic = {
      id: uid('topic'),
      name: '粤语组句',
      type: 'sentences',
      pairs: [],
      texts: [],
      sentences: defaultSentencesYue as SentenceItem[],
    }
    const sentencesEnTopic: Topic = {
      id: uid('topic'),
      name: '英语组句',
      type: 'sentences',
      pairs: [],
      texts: [],
      sentences: defaultSentencesEn as SentenceItem[],
    }
    await replaceAllTopics([
      pairsTopic,
      textsTopic,
      sentencesZhTopic,
      sentencesYueTopic,
      sentencesEnTopic,
    ])
  }

  const tabKeys: TabKey[] = ['pairs', 'texts', 'sentences']

  return (
    <AppShell title="题库管理">
      <div className="space-y-6">
        {/* 类型 Tab 切换：极小宽度下改为竖向排列 */}
        <div className="inline-flex rounded-md border p-1 bg-muted/30 max-[360px]:w-full max-[360px]:flex-col">
          {tabKeys.map((t) => {
            const count = topics.filter((tp) => tp.type === t).length
            return (
              <Button
                key={t}
                variant="ghost"
                size="sm"
                className={cn(
                  'rounded-sm px-4 max-[360px]:w-full',
                  tab === t
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => setTab(t)}
              >
                {t === 'pairs'
                  ? `配对专题 (${count})`
                  : t === 'texts'
                    ? `填空专题 (${count})`
                    : `组句专题 (${count})`}
              </Button>
            )
          })}
        </div>

        {/* 专题管理区 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {tab === 'pairs'
                ? '配对专题'
                : tab === 'texts'
                  ? '填空专题'
                  : '组句专题'}
            </span>
            <Button variant="outline" size="sm" onClick={() => openAddTopic(tab)}>
              <FolderPlus className="h-4 w-4" />
              新增专题
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleTopicDragEnd}
            >
              <SortableContext
                items={tabTopics.map((t) => t.id)}
                strategy={rectSortingStrategy}
              >
                <div className="flex flex-wrap gap-2">
                  {tabTopics.map((topic) => (
                    <SortableTopicChip
                      key={topic.id}
                      topic={topic}
                      isActive={topic.id === activeTopicId}
                      isRenaming={renamingId === topic.id}
                      renameValue={renameValue}
                      setRenameValue={setRenameValue}
                      confirmRename={() => void confirmRename()}
                      cancelRename={() => setRenamingId(null)}
                      itemCount={
                        topic.type === 'pairs'
                          ? topic.pairs.length
                          : topic.type === 'texts'
                            ? topic.texts.length
                            : topic.sentences.length
                      }
                      canDelete={tabTopics.length > 1}
                      onActivate={() => setActiveTopicId(topic.id)}
                      onStartRename={() => startRename(topic)}
                      onDelete={() => void handleDeleteTopic(topic)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </div>

        {/* 当前 tab 内容 */}
        {tab === 'pairs' && activeTopic && (
          <PairList
            pairs={deckApi.deck}
            onAdd={openAddPair}
            onEdit={openEditPair}
            onDelete={(id) => void deckApi.remove(id)}
            onAdjustMastery={(id, delta) =>
              void deckApi.adjustMastery(id, delta)
            }
            onResetMastery={(id) => void deckApi.resetMastery(id)}
            onAiGenerate={openAiGenerate}
            onAiEdit={openAiEdit}
          />
        )}
        {tab === 'texts' && activeTopic && (
          <TextList
            texts={textsApi.texts}
            onAdd={openAddText}
            onEdit={openEditText}
            onDelete={(id) => void textsApi.remove(id)}
            onAdjustMastery={(id, delta) =>
              void textsApi.adjustMastery(id, delta)
            }
            onResetMastery={(id) => void textsApi.resetMastery(id)}
            onAiGenerate={openAiGenerate}
            onAiEdit={openAiEdit}
          />
        )}
        {tab === 'sentences' && activeTopic && (
          <SentenceList
            sentences={sentencesApi.sentences}
            onAdd={openAddSentence}
            onEdit={openEditSentence}
            onDelete={(id) => void sentencesApi.remove(id)}
            onAdjustMastery={(id, delta) =>
              void sentencesApi.adjustMastery(id, delta)
            }
            onResetMastery={(id) => void sentencesApi.resetMastery(id)}
            onAiGenerate={openAiGenerate}
            onAiEdit={openAiEdit}
          />
        )}

        {/* 导入导出 */}
        <ImportExportPanel
          topics={topics}
          onImport={handleImport}
          onRestoreDefaults={handleRestoreDefaults}
        />
      </div>

      {/* 新增专题 Dialog */}
      <Dialog
        open={topicDialogOpen}
        onOpenChange={(o) => {
          setTopicDialogOpen(o)
          if (!o) setNewTopicName('')
        }}
      >
        <DialogHeader>
          <DialogTitle>
            新增
            {newTopicType === 'pairs'
              ? '配对'
              : newTopicType === 'texts'
                ? '填空'
                : '组句'}
            专题
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 p-4">
          <Input
            placeholder="专题名称"
            value={newTopicName}
            onChange={(e) => setNewTopicName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleAddTopic()
            }}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setTopicDialogOpen(false)
                setNewTopicName('')
              }}
            >
              取消
            </Button>
            <Button size="sm" onClick={() => void handleAddTopic()}>
              <Plus className="h-4 w-4" />
              创建
            </Button>
          </div>
        </div>
        <DialogClose />
      </Dialog>

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

      {/* 组句 Dialog */}
      <Dialog
        open={sentenceDialogOpen}
        onOpenChange={(o) => {
          setSentenceDialogOpen(o)
          if (!o) setEditingSentence(null)
        }}
        contentClassName="max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>
            {editingSentence ? '编辑组句题' : '新增组句题'}
          </DialogTitle>
        </DialogHeader>
        <SentenceForm
          initial={editingSentence}
          onSubmit={handleSentenceSubmit}
          onCancel={() => {
            setSentenceDialogOpen(false)
            setEditingSentence(null)
          }}
        />
        <DialogClose />
      </Dialog>

      {/* AI 批量生成 Dialog */}
      <AiGenerateDialog
        open={aiDialogOpen}
        onOpenChange={setAiDialogOpen}
        topicType={tab}
        onConfirm={handleAiConfirm}
      />

      {/* AI 修改题库 Dialog */}
      <AiEditDialog
        open={aiEditOpen}
        onOpenChange={setAiEditOpen}
        topicType={tab}
        items={aiEditItems}
        onApply={handleAiEditApply}
      />
    </AppShell>
  )
}
