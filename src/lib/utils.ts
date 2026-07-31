import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** 合并 Tailwind 类名，处理冲突 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 生成短随机 id */
export function uid(prefix = ''): string {
  const rnd =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return prefix ? `${prefix}_${rnd}` : rnd
}

/** 数组打乱（Fisher–Yates），返回新数组 */
export function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 区间随机整数 [min, max] */
export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/** 从数组中随机取一项 */
export function sample<T>(arr: readonly T[]): T | undefined {
  if (arr.length === 0) return undefined
  return arr[Math.floor(Math.random() * arr.length)]
}

/** 从数组中随机取 n 项（不放回），不足则返回全部打乱 */
export function sampleN<T>(arr: readonly T[], n: number): T[] {
  return shuffle(arr).slice(0, n)
}

/** 限制数值到 [min, max] */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 防抖 */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  wait = 200,
): (...args: A) => void {
  let t: ReturnType<typeof setTimeout> | null = null
  return (...args: A) => {
    if (t) clearTimeout(t)
    t = setTimeout(() => fn(...args), wait)
  }
}

/** 深拷贝（基于 structuredClone，回退 JSON） */
export function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value)
    } catch {
      return JSON.parse(JSON.stringify(value)) as T
    }
  }
  return JSON.parse(JSON.stringify(value)) as T
}

/** 简单延时 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
