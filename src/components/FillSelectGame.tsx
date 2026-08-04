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
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useFillSelectEngine } from '@/hooks/useFillSelectEngine'
import { TextRenderer } from '@/components/TextRenderer'
import { BlankSlot } from '@/components/BlankSlot'
import { WordOption } from '@/components/WordOption'
import { FillResultPanel } from '@/components/FillResultPanel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

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
    // 锁定浏览器默认 touchmove（防止 Android Edge 下拉刷新拦截拖动）
    lockTouchMove()
  }

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    unlockTouchMove()
    const { active, over } = e
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)

    // 从空白槽拖出（id 以 slot: 开头）
    if (activeId.startsWith('slot:')) {
      const blankId = activeId.slice('slot:'.length)
      const optionId = engine.session?.filled[blankId]
      if (!optionId) return

      if (overId === 'pool') {
        // 拖回候选区：清空原空白槽
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
      engine.fillBlank(blankId, activeId)
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

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">选词填空</CardTitle>
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

          <OptionsPool>
            <div className="mb-2 text-xs text-muted-foreground">
              选项区（可拖拽到空白，或点击选项再点击空白；已填入的选项可再次拖动）
            </div>
            <div className="flex flex-wrap gap-2">
              {engine.session.options.map((opt) => (
                <WordOption
                  key={opt.id}
                  optionId={opt.id}
                  value={opt.value}
                  used={opt.used}
                  selected={engine.selectedOptionId === opt.id}
                  onClick={() => {
                    if (engine.session!.confirmed) return
                    if (opt.used) return
                    engine.selectOption(
                      engine.selectedOptionId === opt.id ? null : opt.id,
                    )
                  }}
                />
              ))}
            </div>
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

/**
 * 候选区容器，作为 droppable（id='pool'）让用户可把已填入的选项拖回这里释放
 */
function OptionsPool({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'pool' })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-lg border p-3 transition-colors',
        isOver && 'border-primary bg-primary/5',
      )}
    >
      {children}
    </div>
  )
}
