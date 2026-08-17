import type { PairStats } from '@/types'

/**
 * 题目权重（熟练度）模型
 * - 每道题一个权重 w，默认 50（均衡）
 * - 答对权重 +1（更熟练），答错权重 -2（错误率高），范围 [0, 100]
 * - 出题频率与权重成反比：越熟练（w 高）出现越少，错误率高（w 低）出现越多
 */

/** 默认权重（均衡点） */
export const DEFAULT_WEIGHT = 50
/** 答对时的权重增加 */
export const WEIGHT_CORRECT_BONUS = 1
/** 答错时的权重减少 */
export const WEIGHT_WRONG_PENALTY = 2
/** 权重范围 */
export const WEIGHT_MIN = 0
export const WEIGHT_MAX = 100

/** 取 pair 的当前权重（缺省视为默认） */
export function pairWeight(stats: PairStats | undefined): number {
  return stats?.w ?? DEFAULT_WEIGHT
}

/** 限制权重到 [MIN, MAX] */
export function clampWeight(w: number): number {
  return Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, w))
}

/** 答对/答错后的新权重 */
export function nextWeight(
  stats: PairStats | undefined,
  correct: boolean,
): number {
  const w = pairWeight(stats)
  return clampWeight(
    w + (correct ? WEIGHT_CORRECT_BONUS : -WEIGHT_WRONG_PENALTY),
  )
}

/** 出题采样权重：越熟练（w 高）出现频率越低（w 低则越高） */
export function sampleWeight(stats: PairStats | undefined): number {
  return WEIGHT_MAX + 1 - pairWeight(stats)
}

/** 题库展示文案：低于默认显示错误率，高于默认显示熟练度，均衡返回 null */
export function weightDisplay(stats: PairStats | undefined): string | null {
  const w = pairWeight(stats)
  if (w === DEFAULT_WEIGHT) return null
  const pct = Math.round((Math.abs(w - DEFAULT_WEIGHT) / DEFAULT_WEIGHT) * 100)
  return w < DEFAULT_WEIGHT ? `错误率 ${pct}%` : `熟练度 ${pct}%`
}

/** 权重是否为「偏错误率」（低于均衡点） */
export function isUnderperforming(stats: PairStats | undefined): boolean {
  return pairWeight(stats) < DEFAULT_WEIGHT
}
