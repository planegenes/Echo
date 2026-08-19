/**
 * 熟练度（mastery）模型（所有题型通用：配对 / 填空 / 组句）
 * - 每道题自身维护一个熟练度值，默认 0
 * - 答对 +0.5、答错 -0.8，范围 [-20, 20]
 * - 出题采样权重 y = 0.97^x（x 为熟练度）：越熟练出现越少，易错题出现越多
 * - 题库显示：<0 显示「易错度」，>0 显示「熟练度」，=0 显示 0
 * - 题库可手动调整：[↓|0|↑] 每点一次 ±0.5，重置按钮归零
 */

/** 默认熟练度（均衡点） */
export const MASTERY_DEFAULT = 0
/** 熟练度范围 */
export const MASTERY_MIN = -20
export const MASTERY_MAX = 20
/** 答对时熟练度增加 */
export const MASTERY_CORRECT_BONUS = 0.5
/** 答错时熟练度减少 */
export const MASTERY_WRONG_PENALTY = 0.8
/** 题库手动调整步长（[↓|0|↑] 每点一次） */
export const MASTERY_MANUAL_STEP = 0.5
/** 出题采样曲线底数：y = 0.97^x */
export const MASTERY_SAMPLE_BASE = 0.97
/** 连对/连错增量放大底数：熟练度增量 = 基础值 × 1.1^连续次数 */
export const MASTERY_STREAK_BASE = 1.1

/** 取题目的熟练度（缺省视为 0） */
export function masteryOf(item: { mastery?: number } | undefined): number {
  return item?.mastery ?? MASTERY_DEFAULT
}

/** 限制熟练度到 [MIN, MAX] */
export function clampMastery(m: number): number {
  return Math.min(MASTERY_MAX, Math.max(MASTERY_MIN, m))
}

/** 答对/答错后的新熟练度（答对 +0.5，答错 -0.8）与连对/连错计数
 * - 熟练度增量 = 基础值 × 1.1^连续次数（答对看连对次数，答错看连错次数）
 * - 答对：连对 +1、连错归零；答错反之
 */
export function nextMastery(
  item:
    | {
        mastery?: number
        correctStreak?: number
        wrongStreak?: number
      }
    | undefined,
  correct: boolean,
): { mastery: number; correctStreak: number; wrongStreak: number } {
  const cs = item?.correctStreak ?? 0
  const ws = item?.wrongStreak ?? 0
  const base = correct ? MASTERY_CORRECT_BONUS : MASTERY_WRONG_PENALTY
  const x = correct ? cs : ws
  const delta = base * Math.pow(MASTERY_STREAK_BASE, x)
  return {
    mastery: clampMastery(masteryOf(item) + (correct ? delta : -delta)),
    correctStreak: correct ? cs + 1 : 0,
    wrongStreak: correct ? 0 : ws + 1,
  }
}

/** 手动调整熟练度（题库 [↓|0|↑] 按钮，步长 ±0.5） */
export function adjustMastery(
  item: { mastery?: number } | undefined,
  delta: number,
): number {
  return clampMastery(masteryOf(item) + delta)
}

/** 出题采样权重：y = 0.97^x，熟练度越高权重越小、出题越少 */
export function sampleWeight(mastery: number): number {
  return Math.pow(MASTERY_SAMPLE_BASE, mastery)
}
