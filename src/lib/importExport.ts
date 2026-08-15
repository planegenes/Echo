import { z } from 'zod'
import type { PairItem, SentenceItem, Snapshot, TextItem, Topic } from '@/types'
import type { PointsState } from '@/store/points'
import type { DailyStreakState, DayLogs } from '@/lib/dailyStreak'
import { uid } from './utils'

/**
 * 导入/导出与 zod 校验
 * v2: 快照格式为 topics 列表；兼容旧版 pairs/texts 格式
 * v3: 新增 sentences（组句）类型
 */

const contentSchema = z.object({
  format: z.enum(['text', 'latex', 'ruby']),
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

const sentenceSchema = z.object({
  id: z.string().min(1),
  answer: z.string(),
  hint: z.string().default(''),
  words: z.array(z.string()).default([]),
})

const topicSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['pairs', 'texts', 'sentences']),
  pairs: z.array(pairSchema).default([]),
  texts: z.array(textSchema).default([]),
  sentences: z.array(sentenceSchema).default([]),
})

const pointsStateSchema = z.object({
  points: z.number(),
  streak: z.number(),
  lastCorrectAt: z.number().nullable(),
})

const dailyStreakStateSchema = z.object({
  todayCorrect: z.number(),
  countDate: z.string().nullable(),
})

const dayLogSchema = z.object({
  date: z.string(),
  answered: z.boolean(),
  completed: z.boolean(),
  pointsSpent: z.number(),
  repaired: z.boolean(),
})

// 旧版快照里的 streakDays/lastCompletedDate 字段会被 zod 自动忽略（strip）
const dayLogsSchema = z.record(z.string(), dayLogSchema).optional()

// 兼容旧版：topics 或 pairs+texts；points/dailyStreak/updatedAt 用于 WebDAV 同步
const snapshotSchema = z.object({
  topics: z.array(topicSchema).optional(),
  pairs: z.array(pairSchema).optional(),
  texts: z.array(textSchema).optional(),
  points: pointsStateSchema.optional(),
  dailyStreak: dailyStreakStateSchema.optional(),
  dayLogs: dayLogsSchema,
  updatedAt: z.number().optional(),
})

export interface ParseResult {
  ok: boolean
  data?: Snapshot
  error?: string
}

/** 校验并规范化导入的快照 JSON（兼容旧版 pairs/texts 格式） */
export function parseSnapshot(input: unknown): ParseResult {
  const result = snapshotSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: result.error.message }
  }
  const r = result.data
  let topics: Topic[]

  if (r.topics && r.topics.length > 0) {
    // 新格式：直接使用 topics
    topics = r.topics.map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      pairs: t.pairs.map((p) => ({
        ...p,
        stats: { lr: p.stats?.lr ?? 0, rl: p.stats?.rl ?? 0 },
      })),
      texts: t.texts.slice(),
      sentences: t.sentences.map((s) => ({
        id: s.id,
        answer: s.answer,
        hint: s.hint ?? '',
        words: s.words.slice(),
      })),
    }))
  } else {
    // 旧格式：将 pairs + texts 拆分为两个专题（按类型）
    const pairs = (r.pairs ?? []).map((p) => ({
      ...p,
      stats: { lr: p.stats?.lr ?? 0, rl: p.stats?.rl ?? 0 },
    }))
    const texts = (r.texts ?? []).slice()
    topics = [
      { id: uid('topic'), name: '测试题库（配对）', type: 'pairs', pairs, texts: [], sentences: [] },
      { id: uid('topic'), name: '测试题库（文本）', type: 'texts', pairs: [], texts, sentences: [] },
    ]
  }

  return {
    ok: true,
    data: {
      topics,
      points: r.points,
      dailyStreak: r.dailyStreak,
      dayLogs: r.dayLogs,
      updatedAt: r.updatedAt,
    },
  }
}

/** 导出当前数据为快照（points/dailyStreak/dayLogs/updatedAt 可选，用于 WebDAV 同步） */
export function buildSnapshot(
  topics: Topic[],
  points?: PointsState,
  dailyStreak?: DailyStreakState,
  dayLogs?: DayLogs,
  updatedAt?: number,
): Snapshot {
  return {
    topics: topics.map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      pairs: t.pairs.map((p) => ({
        ...p,
        stats: { lr: p.stats?.lr ?? 0, rl: p.stats?.rl ?? 0 },
      })),
      texts: t.texts.slice(),
      sentences: t.sentences.map((s) => ({
        id: s.id,
        answer: s.answer,
        hint: s.hint,
        words: s.words.slice(),
      })),
    })),
    points,
    dailyStreak,
    dayLogs,
    updatedAt,
  }
}

/** 下载为 JSON 文件 */
export function downloadSnapshot(snapshot: Snapshot, filename = 'echo-snapshot.json'): void {
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

/** 检查 Clipboard API 是否可用（需要安全上下文） */
export function isClipboardApiAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.clipboard
}

/** 将快照 JSON 写入剪贴板，非安全上下文下降级为 execCommand */
export async function copySnapshotToClipboard(topics: Topic[]): Promise<void> {
  const snapshot = buildSnapshot(topics)
  const text = JSON.stringify(snapshot, null, 2)

  if (isClipboardApiAvailable()) {
    await navigator.clipboard.writeText(text)
    return
  }

  // 非安全上下文下降级：使用 execCommand('copy')
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(textarea)
  if (!ok) throw new Error('复制命令执行失败')
}

/** 从剪贴板读取并解析快照，返回 ParseResult */
export async function readSnapshotFromClipboard(): Promise<ParseResult> {
  if (!isClipboardApiAvailable()) {
    return { ok: false, error: '当前环境不支持剪贴板读取' }
  }
  const text = await navigator.clipboard.readText()
  return parseSnapshot(JSON.parse(text))
}

/** 为导入的 pair/text/sentence/topic 补充缺失的 id */
export function ensureIds(snapshot: Snapshot): Snapshot {
  return {
    topics: snapshot.topics.map((t) => ({
      id: t.id || uid('topic'),
      name: t.name,
      type: t.type,
      pairs: t.pairs.map((p) =>
        p.id ? p : { ...p, id: uid('pair') },
      ) as PairItem[],
      texts: t.texts.map((t2) =>
        t2.id ? t2 : { ...t2, id: uid('text') },
      ) as TextItem[],
      sentences: t.sentences.map((s) =>
        s.id ? s : { ...s, id: uid('sentence') },
      ) as SentenceItem[],
    })),
    points: snapshot.points,
    dailyStreak: snapshot.dailyStreak,
    dayLogs: snapshot.dayLogs,
    updatedAt: snapshot.updatedAt,
  }
}
