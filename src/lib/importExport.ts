import { z } from 'zod'
import type { PairItem, Snapshot, TextItem } from '@/types'
import { uid } from './utils'

/**
 * 导入/导出与 zod 校验
 * 详见 spec 3.4：导入时校验结构；缺少 stats 的 pair 自动补 { lr: 0, rl: 0 }
 */

const contentSchema = z.object({
  format: z.enum(['text', 'latex']),
  value: z.string().min(1),
})

const pairStatsSchema = z
  .object({
    lr: z.number().default(0),
    rl: z.number().default(0),
  })
  .default({ lr: 0, rl: 0 })

const pairSchema = z.object({
  id: z.string().min(1),
  left: contentSchema,
  right: contentSchema,
  stats: pairStatsSchema,
})

const textSchema = z.object({
  id: z.string().min(1),
  content: z.string().min(1),
})

const snapshotSchema = z.object({
  pairs: z.array(pairSchema).default([]),
  texts: z.array(textSchema).default([]),
})

export interface ParseResult {
  ok: boolean
  data?: Snapshot
  error?: string
}

/** 校验并规范化导入的快照 JSON */
export function parseSnapshot(input: unknown): ParseResult {
  const result = snapshotSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: result.error.message }
  }
  const data = result.data as Snapshot
  // 规范化 stats
  data.pairs = data.pairs.map((p) => ({
    ...p,
    stats: { lr: p.stats?.lr ?? 0, rl: p.stats?.rl ?? 0 },
  }))
  return { ok: true, data }
}

/** 导出当前数据为快照 */
export function buildSnapshot(pairs: PairItem[], texts: TextItem[]): Snapshot {
  return {
    pairs: pairs.map((p) => ({
      ...p,
      stats: { lr: p.stats?.lr ?? 0, rl: p.stats?.rl ?? 0 },
    })),
    texts: texts.slice(),
  }
}

/** 下载为 JSON 文件 */
export function downloadSnapshot(snapshot: Snapshot, filename = 'pair-quiz-snapshot.json'): void {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** 读取用户选择的文件并解析为快照 */
export function readSnapshotFile(file: File): Promise<ParseResult> {
  return file
    .text()
    .then((text) => parseSnapshot(JSON.parse(text)))
    .catch((err: unknown) => ({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }))
}

/** 为导入的 pair/text 衺充缺失的 id（若上游缺失） */
export function ensureIds(snapshot: Snapshot): Snapshot {
  return {
    pairs: snapshot.pairs.map((p) =>
      p.id ? p : { ...p, id: uid('pair') },
    ) as PairItem[],
    texts: snapshot.texts.map((t) =>
      t.id ? t : { ...t, id: uid('text') },
    ) as TextItem[],
  }
}
