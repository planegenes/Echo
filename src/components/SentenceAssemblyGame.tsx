import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragOverEvent,
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
import { ContentRenderer } from '@/components/ContentRenderer'
import { WordOption } from '@/components/WordOption'
import { OptionsPool } from '@/components/OptionsPool'
import { gapAwareHorizontalStrategy } from '@/lib/dnd'
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
 * - 下方：单词候选区（与选词填空选项区同款：候选区内拖拽排序、点击选中后点击作答区放入）
 */
export function SentenceAssemblyGame({ sentenceId }: SentenceAssemblyGameProps) {
  const engine = useSentenceAssemblyEngine(sentenceId)
  const [activeId, setActiveId] = useState<string | null>(null)
  /** 点击选中的候选区单词（再点击作答区空白处放入） */
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null)
  const [isOverPool, setIsOverPool] = useState(false)
  /** 候选区容器引用（用于几何相交判定，避免 over.id 边界抖动） */
  const poolRef = useRef<HTMLDivElement | null>(null)

  /**
   * 拖拽物当前位置是否与候选区矩形相交（稳定判定，不依赖 over.id）
   * over 会在「候选区容器 / 子选项 / 作答区」之间快速切换，用它做高亮会闪烁
   */
  const computeOverPool = useCallback(
    (e: DragOverEvent | DragEndEvent): boolean => {
      const poolRect = poolRef.current?.getBoundingClientRect()
      const pos = e.active.rect.current.translated
      if (!poolRect || !pos) return false
      return (
        pos.left < poolRect.right &&
        pos.right > poolRect.left &&
        pos.top < poolRect.bottom &&
        pos.bottom > poolRect.top
      )
    },
    [],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => {
    if (engine.canPlay && !engine.session) engine.start()
  }, [engine])

  // 回合/会话变化时清空选中状态
  useEffect(() => {
    if (engine.session) setSelectedOptionId(null)
  }, [engine.session])

  useEffect(() => unlockTouchMove, [])

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id))
    // 拖动从候选区开始（作答区拖动不影响候选区占位）
    setIsOverPool(true)
    lockTouchMove()
  }

  /** 拖动经过时用几何相交判断是否在候选区内（稳定、不闪烁） */
  const onDragOver = (e: DragOverEvent) => {
    setIsOverPool(computeOverPool(e))
  }

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    setIsOverPool(false)
    unlockTouchMove()
    const { active, over } = e
    const activeIdStr = String(active.id)
    const overId = over ? String(over.id) : ''
    // 松手位置：几何判定（候选区内任意位置都算放回）或 over 指向 pool
    const inPool = computeOverPool(e)
    if (!over && !inPool) return
    if (!engine.session) return
    const placed = engine.session.placed
    const isPlacedActive = placed.includes(activeIdStr)

    if (!isPlacedActive) {
      // 从候选区拖出
      if (overId === 'answer-area') {
        engine.placeOption(activeIdStr)
      } else if (overId !== 'pool' && placed.includes(overId)) {
        const idx = placed.indexOf(overId)
        engine.insertOption(activeIdStr, idx)
      } else if (overId !== 'pool' && overId !== activeIdStr) {
        // 候选区内排序：over 为另一个选项
        engine.reorderOptions(activeIdStr, overId)
      }
      return
    }

    // 从作答区拖动
    const from = placed.indexOf(activeIdStr)
    if (overId === 'pool' || inPool) {
      engine.removeAt(from)
    } else if (overId === 'answer-area') {
      // 拖到作答区末尾
      if (from !== placed.length - 1) engine.reorder(from, placed.length - 1)
    } else if (overId !== activeIdStr && placed.includes(overId)) {
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
          // 每次 render 实时重测 droppable 尺寸，避免换行/坍缩时测量错位
          measuring={{
            droppable: {
              strategy: MeasuringStrategy.Always,
            },
          }}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setActiveId(null)
            setIsOverPool(false)
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
            selectedOptionId={selectedOptionId}
            onEmptyClick={() => {
              if (session.confirmed) return
              if (selectedOptionId) {
                engine.placeOption(selectedOptionId)
                setSelectedOptionId(null)
              }
            }}
          >
            <SortableContext
              items={session.placed}
              strategy={rectSortingStrategy}
            >
              <div className="flex flex-wrap gap-1.5 min-h-[2.5rem] items-center">
                {placedOpts.length === 0 && (
                  <span className="text-sm text-muted-foreground">
                    {selectedOptionId
                      ? '点击此处空白放入选中的单词'
                      : '从下方拖入单词组成句子，或点击单词再点击此处放入'}
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

          {/* 下方：候选区（与选词填空选项区同款实现） */}
          <OptionsPool
            ref={poolRef}
            isOverPool={isOverPool}
            showDropHint={
              activeId !== null &&
              placedOpts.some((o) => o.id === activeId) &&
              isOverPool
            }
          >
            <div className="mb-2 text-xs text-muted-foreground">
              单词区（拖拽到上方作答区、拖拽排序，或点击选中后再点击作答区放入）
            </div>
            <SortableContext
              items={poolOpts.map((o) => o.id)}
              strategy={gapAwareHorizontalStrategy}
            >
              <div className="flex flex-wrap gap-2">
                {poolOpts.length === 0 && (
                  <span className="text-sm text-muted-foreground">
                    所有单词已使用
                  </span>
                )}
                {poolOpts.map((opt) => (
                  <WordOption
                    key={opt.id}
                    optionId={opt.id}
                    value={opt.value}
                    selected={selectedOptionId === opt.id}
                    isOverPool={isOverPool}
                    onClick={() => {
                      if (session.confirmed) return
                      setSelectedOptionId((prev) =>
                        prev === opt.id ? null : opt.id,
                      )
                    }}
                  />
                ))}
              </div>
            </SortableContext>
          </OptionsPool>

          <DragOverlay>
            {activeValue ? (
              <div className="rounded-md border bg-card px-3 py-1.5 text-sm font-medium shadow">
                {activeValue.includes('^') ? (
                  <ContentRenderer
                    content={{ format: 'ruby', value: activeValue }}
                  />
                ) : (
                  activeValue
                )}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {/* 作答区文本预览 */}
        <div className="rounded-md border bg-muted/10 p-2 text-sm">
          <span className="text-muted-foreground">当前作答：</span>
          {placedOpts.length > 0 ? (
            <span>
              {placedOpts.map((o, i) => (
                <ContentRenderer
                  key={i}
                  content={{
                    format: o.value.includes('^') ? 'ruby' : 'text',
                    value: o.value,
                  }}
                />
              ))}
            </span>
          ) : (
            '（空）'
          )}
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
  selectedOptionId,
  onEmptyClick,
}: {
  children: React.ReactNode
  disabled: boolean
  result: boolean | null
  selectedOptionId: string | null
  onEmptyClick: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'answer-area' })
  return (
    <div
      ref={setNodeRef}
      onClick={(e) => {
        // 只响应点击容器空白处（单词及其移除按钮各自处理）
        if (e.target === e.currentTarget) onEmptyClick()
      }}
      className={cn(
        'rounded-lg border-2 border-dashed p-3 transition-colors min-h-[3.5rem]',
        selectedOptionId && !disabled && 'cursor-pointer',
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
        // 使用 DragOverlay 时，被拖动的原始元素留在原位占位，不跟随光标
        transform: isDragging ? undefined : CSS.Translate.toString(transform),
        transition: isDragging ? undefined : transition,
      }}
      className={cn(
        // 固定高度 h-8：一行/多行时元素高度一致
        'inline-flex h-8 items-center gap-1 rounded-md border bg-card px-2.5 text-sm font-medium shadow-sm',
        // 拖动时完全隐藏原始元素（保留占位不显示残影），视觉由 DragOverlay 承担
        isDragging && 'invisible',
        !disabled && 'cursor-grab active:cursor-grabbing',
      )}
      {...attributes}
      {...listeners}
    >
      <ContentRenderer
        content={{
          format: value.includes('^') ? 'ruby' : 'text',
          value,
        }}
      />
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
            标准答案：
            <ContentRenderer
              content={{
                format: answer.includes('^') ? 'ruby' : 'text',
                value: answer,
              }}
            />
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
