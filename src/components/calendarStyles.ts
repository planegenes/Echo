import type { DayStatus } from '@/lib/dailyStreak'

/** 日历表头（周一开头） */
export const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

/** 各状态的格子样式 */
export const STATUS_STYLE: Record<DayStatus, string> = {
  completed: 'bg-emerald-500 text-white',
  freeze: 'bg-orange-500 text-white',
  repair: 'bg-sky-500 text-white',
  answered: 'bg-amber-400 text-white',
  none: 'bg-muted text-muted-foreground',
}

/** 各状态的文字说明 */
export const STATUS_LABEL: Record<DayStatus, string> = {
  completed: '正常打卡',
  freeze: '连胜激冻',
  repair: '补签',
  answered: '未完成',
  none: '未答题',
}
