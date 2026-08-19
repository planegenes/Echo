import type { SortingStrategy } from '@dnd-kit/sortable'

/**
 * gap 感知的水平排序策略（填空题与组句题候选区共用）
 * 与 horizontalListSortingStrategy 的区别：被挤开项的位移统一用
 * 「拖动选项宽度 + 拖动选项与其相邻项的实际 gap」计算。
 * 选项坍缩时用负 margin 抵消了与后一项的 gap（测量为 0），位移随之归零，
 * 与实际布局一致；全宽时行为与 horizontalListSortingStrategy 相同。
 */
export const gapAwareHorizontalStrategy: SortingStrategy = ({
  rects,
  activeIndex,
  overIndex,
  index,
}) => {
  if (activeIndex === overIndex) return null
  const activeRect = rects[activeIndex]
  if (!activeRect) return null

  // 拖动项与其相邻项的实际 gap（坍缩抵消后为 0）
  let gap = 0
  if (activeIndex < index) {
    const next = rects[activeIndex + 1]
    if (next) gap = next.left - (activeRect.left + activeRect.width)
  } else if (activeIndex > index) {
    const prev = rects[activeIndex - 1]
    if (prev) gap = activeRect.left - (prev.left + prev.width)
  }

  if (index === activeIndex) {
    const overRect = rects[overIndex]
    if (!overRect) return null
    return {
      x:
        activeIndex < overIndex
          ? overRect.left +
            overRect.width -
            activeRect.left -
            activeRect.width
          : overRect.left - activeRect.left,
      y: 0,
      scaleX: 1,
      scaleY: 1,
    }
  }

  if (index > activeIndex && index <= overIndex) {
    return { x: -activeRect.width - gap, y: 0, scaleX: 1, scaleY: 1 }
  }
  if (index < activeIndex && index >= overIndex) {
    return { x: activeRect.width + gap, y: 0, scaleX: 1, scaleY: 1 }
  }
  return { x: 0, y: 0, scaleX: 1, scaleY: 1 }
}
