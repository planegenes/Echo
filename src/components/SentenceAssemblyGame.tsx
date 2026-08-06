import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useSentenceAssemblyEngine } from '@/hooks/useSentenceAssemblyEngine'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Check, X, RotateCcw } from 'lucide-react'

function preventTouchMove(e: TouchEvent) {
  if (e.cancelable) e.preventDefault()
}
function lockTouchMove() {
  window.addEventListener('touchmove', preventTouchMove, { passive: false })
}
function unlockTouchMove() {
  window.removeEventListener('touchmove', preventTouchMove)
}

export interface SentenceAssemblyGameProps {
  sentenceId: string | null
}

/**
 * 组句题主组件
 * - 上方：提示
 * - 中间：作答区（可拖入、拖序、拖回）
 * - 下方：单词候选区
 */
export function SentenceAssemblyGame({ sentenceId }: SentenceAssemblyGameProps) {
  const engine = useSentenceAssemblyEngine(sentenceId)
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => {
    if (engine.canPlay && !engine.session) engine.start()
  }, [engine])

  useEffect(() => unlockTouchMove, [])

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id))
    lockTouchMove()
  }

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    unlockTouchMove()
    const { active, over } = e
    if (!over || !engine.session) return
    const activeId = String(active.id)
    const overId = String(over.id)
    const placed = engine.session.placed
    const isPlacedActive = placed.includes(activeId)

    if (!isPlacedActive) {
      // 从候选区拖出
      if (overId === 'answer-area') {
        engine.placeOption(activeId)
      } else if (overId !== 'pool' && placed.includes(overId)) {
        const idx = placed.indexOf(overId)
        engine.insertOption(activeId, idx)
      }
      return
    }

    // 从作答区拖动
    const from = placed.indexOf(activeId)
    if (overId === 'pool') {
      engine.removeAt(from)
    } else if (overId === 'answer-area') {
      // 拖到作答区末尾
      if (from !== placed.length - 1) engine.reorder(from, placed.length - 1)
    } else if (overId !== activeId && placed.includes(overId)) {
      const to = placed.indexOf(overId)
      engine.reorder(from, to)
    }
  }

  const activeValue = useMemo(() => {
    if (!activeId || !engine.session) return null
    return engine.session.options.find((o) => o.id === activeId)?.value ?? null
  }, [activeId, engine.session])

  if (!sentenceId) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          请先选择一道题目。
        </CardContent>
      </Card>
    )
  }

  if (!engine.canPlay) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          该题目没有可用的单词。
        </CardContent>
      </Card>
    )
  }

  if (!engine.sentence || !engine.session) return null

  const { sentence, session, result } = engine
  const placedOpts = session.placed.map((id) =>
    session.options.find((o) => o.id === id)!,
  )
  const poolOpts = session.options.filter((o) => !o.used)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">组句题</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <DndContext
          sensors={sensors}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setActiveId(null)
            unlockTouchMove()
          }}
        >
          {/* 上方：提示 */}
          <div className="rounded-lg border bg-muted/20 p-3 text-sm">
            <span className="text-muted-foreground">提示：</span>
            <span className="font-medium">
              {sentence.hint || '（无提示）'}
            </span>
          </div>

          {/* 中间：作答区 */}
          <AnswerArea
            disabled={session.confirmed}
            result={result?.correct ?? null}
          >
            <SortableContext
              items={session.placed}
              strategy={rectSortingStrategy}
            >
              <div className="flex flex-wrap gap-1.5 min-h-[2.5rem] items-center">
                {placedOpts.length === 0 && (
                  <span className="text-sm text-muted-foreground">
                    从下方拖入单词组成句子
                  </span>
                )}
                {placedOpts.map((opt, i) => (
                  <SortableWord
                    key={opt.id}
                    id={opt.id}
                    value={opt.value}
                    disabled={session.confirmed}
                    onRemove={() => engine.removeAt(i)}
                  />
                ))}
              </div>
            </SortableContext>
          </AnswerArea>

          {/* 下方：候选区 */}
          <PoolArea>
            <div className="flex flex-wrap gap-1.5 min-h-[2.5rem]">
              {poolOpts.length === 0 && (
                <span className="text-sm text-muted-foreground">
                  所有单词已使用
                </span>
              )}
              {poolOpts.map((opt) => (
                <PoolWord
                  key={opt.id}
                  id={opt.id}
                  value={opt.value}
                  disabled={session.confirmed}
                  onClick={() => engine.placeOption(opt.id)}
                />
              ))}
            </div>
          </PoolArea>

          <DragOverlay>
            {activeValue ? (
              <div className="inline-flex items-center rounded-md border bg-card px-2.5 py-1 text-sm font-medium shadow-sm">
                {activeValue}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {/* 作答区文本预览 */}
        <div className="rounded-md border bg-muted/10 p-2 text-sm">
          <span className="text-muted-foreground">当前作答：</span>
          {placedOpts.map((o) => o.value).join('') || '（空）'}
        </div>

        {!session.confirmed ? (
          <div className="flex justify-end">
            <Button
              onClick={() => engine.confirm()}
              disabled={session.placed.length === 0}
            >
              <Check className="h-4 w-4" />
              确认
            </Button>
          </div>
        ) : (
          <ResultPanel
            correct={result?.correct ?? false}
            answer={sentence.answer}
            onRetry={() => engine.reset()}
          />
        )}
      </CardContent>
    </Card>
  )
}

/** 作答区容器（droppable id='answer-area'） */
function AnswerArea({
  children,
  disabled,
  result,
}: {
  children: React.ReactNode
  disabled: boolean
  result: boolean | null
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'answer-area' })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-lg border-2 border-dashed p-3 transition-colors min-h-[3.5rem]',
        isOver && 'border-primary bg-primary/5',
        result === true && 'border-success bg-success/5',
        result === false && 'border-destructive bg-destructive/5',
        disabled && 'cursor-default',
      )}
    >
      {children}
    </div>
  )
}

/** 候选区容器（droppable id='pool'） */
function PoolArea({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'pool' })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-lg border p-3 transition-colors',
        isOver && 'border-primary bg-primary/5',
      )}
    >
      <div className="mb-2 text-xs text-muted-foreground">
        单词区（拖动到上方作答区，或点击单词直接放入末尾）
      </div>
      {children}
    </div>
  )
}

/** 作答区可排序单词 */
function SortableWord({
  id,
  value,
  disabled,
  onRemove,
}: {
  id: string
  value: string
  disabled: boolean
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled })
  return (
    <span
      ref={setNodeRef}
      style={{
        // 使用 DragOverlay 时，被拖动的原始元素无需跟随光标，避免 scale/位移干扰 rect 测量
        transform: isDragging ? undefined : CSS.Translate.toString(transform),
        transition: isDragging ? undefined : transition,
      }}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border bg-card px-2.5 py-1 text-sm font-medium shadow-sm',
        isDragging && 'opacity-40',
        !disabled && 'cursor-grab active:cursor-grabbing',
      )}
      {...attributes}
      {...listeners}
    >
      {value}
      {!disabled && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="text-muted-foreground hover:text-destructive"
          title="移除"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )
}

/** 候选区可拖动单词 */
function PoolWord({
  id,
  value,
  disabled,
  onClick,
}: {
  id: string
  value: string
  disabled: boolean
  onClick: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id, disabled })
  return (
    <button
      type="button"
      ref={setNodeRef}
      style={{
        // 使用 DragOverlay 时，被拖动的原始元素留在原位占位，不跟随光标
        transform: isDragging ? undefined : CSS.Transform.toString(transform),
      }}
      className={cn(
        'inline-flex items-center rounded-md border bg-card px-2.5 py-1 text-sm font-medium shadow-sm transition-colors',
        isDragging && 'opacity-40',
        disabled
          ? 'cursor-default opacity-50'
          : 'cursor-grab active:cursor-grabbing hover:border-primary/40',
      )}
      onClick={onClick}
      {...attributes}
      {...listeners}
    >
      {value}
    </button>
  )
}

function ResultPanel({
  correct,
  answer,
  onRetry,
}: {
  correct: boolean
  answer: string
  onRetry: () => void
}) {
  return (
    <div className="space-y-3">
      <div
        className={cn(
          'rounded-md border px-3 py-2 text-sm',
          correct
            ? 'border-success/40 bg-success/10 text-success'
            : 'border-destructive/40 bg-destructive/10 text-destructive',
        )}
      >
        {correct ? '回答正确！' : '回答不正确。'}
        {!correct && (
          <div className="mt-1 text-xs opacity-90">
            标准答案：{answer}
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw className="h-4 w-4" />
          再来一次
        </Button>
      </div>
    </div>
  )
}
