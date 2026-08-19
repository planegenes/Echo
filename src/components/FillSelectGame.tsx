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
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
} from '@dnd-kit/sortable'
import { gapAwareHorizontalStrategy } from '@/lib/dnd'
import { useFillSelectEngine } from '@/hooks/useFillSelectEngine'
import { TextRenderer } from '@/components/TextRenderer'
import { BlankSlot } from '@/components/BlankSlot'
import { WordOption } from '@/components/WordOption'
import { OptionsPool } from '@/components/OptionsPool'
import { FillResultPanel } from '@/components/FillResultPanel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * 阻止浏览器默认 touchmove 行为（如 Android Edge 下拉刷新）。
 * 模块级函数保证 add/remove 引用一致。
 */
function preventTouchMove(e: TouchEvent) {
  if (e.cancelable) e.preventDefault()
}

function lockTouchMove() {
  window.addEventListener('touchmove', preventTouchMove, { passive: false })
}

function unlockTouchMove() {
  window.removeEventListener('touchmove', preventTouchMove)
}

export interface FillSelectGameProps {
  textId: string | null
}

/**
 * 选词填空主组件
 * - 选项可从候选区拖到空白槽
 * - 已填入的选项可再次拖到别的空格，或拖回候选区
 */
export function FillSelectGame({ textId }: FillSelectGameProps) {
  const engine = useFillSelectEngine(textId)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [isOverPool, setIsOverPool] = useState(false)
  /** 选项区容器引用（用于几何相交判定，避免 over.id 边界抖动） */
  const poolRef = useRef<HTMLDivElement | null>(null)

  /**
   * 拖拽物当前位置是否与选项区矩形相交（稳定判定，不依赖 over.id）
   * over 会在「选项区容器 / 子选项 / 空白槽」之间快速切换，用它做高亮会闪烁
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
    useSensor(KeyboardSensor),
  )

  useEffect(() => {
    if (engine.canPlay && !engine.session) {
      engine.start()
    }
  }, [engine])

  // 组件卸载时保险性移除监听（避免内存泄漏）
  useEffect(() => unlockTouchMove, [])

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id))
    // 拖动从选项区开始（slot 拖动不影响选项区占位）
    setIsOverPool(true)
    // 锁定浏览器默认 touchmove（防止 Android Edge 下拉刷新拦截拖动）
    lockTouchMove()
  }

  /** 拖动经过时用几何相交判断是否在选项区内（稳定、不闪烁） */
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
    // 松手位置：几何判定（选项区内任意位置都算放回）或 over 指向 pool
    const inPool = computeOverPool(e)
    if (!over && !inPool) return

    // 从空白槽拖出（id 以 slot: 开头）
    if (activeIdStr.startsWith('slot:')) {
      const blankId = activeIdStr.slice('slot:'.length)
      const optionId = engine.session?.filled[blankId]
      if (!optionId) return

      if (overId === 'pool' || inPool) {
        // 拖回候选区：清空原空白槽（悬停在选项上也视为放回）
        engine.clearBlank(blankId)
      } else if (overId.startsWith('blank:')) {
        const newBlankId = overId.slice('blank:'.length)
        if (newBlankId !== blankId) {
          // 移到另一个空格：先清空原空格释放选项，再填入新空格
          engine.clearBlank(blankId)
          engine.fillBlank(newBlankId, optionId)
        }
      }
      // 拖到无效区域：保持原状（什么都不做）
      return
    }

    // 从候选区拖出（active.id 直接是 optionId，如 opt_xxx）
    if (overId.startsWith('blank:')) {
      const blankId = overId.slice('blank:'.length)
      engine.fillBlank(blankId, activeIdStr)
      return
    }

    // 候选区内排序：over 为另一个选项（非 pool、非 active）
    if (overId !== 'pool' && overId !== activeIdStr) {
      engine.reorderOptions(activeIdStr, overId)
    }
  }

  // DragOverlay 显示当前拖动的选项值（支持从候选区或从空白槽拖出）
  const activeValue = useMemo(() => {
    if (!activeId || !engine.session) return null
    if (activeId.startsWith('slot:')) {
      const blankId = activeId.slice('slot:'.length)
      const optionId = engine.session.filled[blankId]
      return engine.session.options.find((o) => o.id === optionId)?.value ?? null
    }
    return engine.session.options.find((o) => o.id === activeId)?.value ?? null
  }, [activeId, engine.session])

  if (!textId) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          请先选择一段文本。
        </CardContent>
      </Card>
    )
  }

  if (!engine.canPlay) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          该文本没有可识别的空白（使用 <code>*内容*</code> 标记空白）。
        </CardContent>
      </Card>
    )
  }

  if (!engine.parsed || !engine.session) {
    return null
  }

  const unusedOptions = engine.session.options.filter((o) => !o.used)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">选词填空</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <DndContext
          sensors={sensors}
          // 每次 render 实时重测 droppable 尺寸：选项坍缩/展开（max-width 动画）时
          // rect 快照与实际布局保持一致，排序位移才不会错位
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
          <div className="rounded-lg border bg-muted/20 p-4 text-base">
            <TextRenderer
              parsed={engine.parsed}
              renderBlank={(seg) => {
                const filledOptId = engine.session!.filled[seg.id]
                const filledValue = filledOptId
                  ? engine.session!.options.find((o) => o.id === filledOptId)
                      ?.value ?? null
                  : null
                const result = engine.results?.find(
                  (r) => r.blankId === seg.id,
                )
                return (
                  <BlankSlot
                    blankId={seg.id}
                    pad={engine.blankPad}
                    filledValue={filledValue}
                    result={result ? (result.correct ? 'correct' : 'wrong') : null}
                    onClick={() => {
                      if (engine.session!.confirmed) return
                      if (filledValue) engine.clearBlank(seg.id)
                      else if (engine.selectedOptionId) {
                        engine.fillBlank(seg.id, engine.selectedOptionId)
                      }
                    }}
                    disabled={engine.session!.confirmed}
                  />
                )
              }}
            />
          </div>

          <OptionsPool
            ref={poolRef}
            isOverPool={isOverPool}
            showDropHint={
              activeId !== null &&
              activeId.startsWith('slot:') &&
              isOverPool
            }
          >
            <div className="mb-2 text-xs text-muted-foreground">
              选项区（可拖拽到空白、拖拽排序，或点击选项再点击空白）
            </div>
            <SortableContext
              items={unusedOptions.map((o) => o.id)}
              strategy={gapAwareHorizontalStrategy}
            >
              <div className="flex flex-wrap gap-2">
                {unusedOptions.map((opt) => (
                  <WordOption
                    key={opt.id}
                    optionId={opt.id}
                    value={opt.value}
                    selected={engine.selectedOptionId === opt.id}
                    isOverPool={isOverPool}
                    onClick={() => {
                      if (engine.session!.confirmed) return
                      engine.selectOption(
                        engine.selectedOptionId === opt.id ? null : opt.id,
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
                {activeValue}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {!engine.session.confirmed ? (
          <div className="flex justify-end">
            <Button onClick={() => engine.confirm()} disabled={!engine.session}>
              确认答案
            </Button>
          </div>
        ) : (
          engine.results && (
            <FillResultPanel
              results={engine.results}
              onRetry={() => engine.reset()}
            />
          )
        )}
      </CardContent>
    </Card>
  )
}
