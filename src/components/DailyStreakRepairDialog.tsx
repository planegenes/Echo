import { useAtom } from 'jotai'
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { repairDialogAtom } from '@/store/dailyStreak'

/**
 * 每日连胜「自动激冻」提示弹框
 * 当启动检测到漏了一天且已用积分自动连胜激冻时显示
 */
export function DailyStreakRepairDialog() {
  const [data, setData] = useAtom(repairDialogAtom)

  return (
    <Dialog
      open={data !== null}
      onOpenChange={(open) => {
        if (!open) setData(null)
      }}
    >
      <DialogHeader>
        <DialogTitle>连胜已激冻</DialogTitle>
        <DialogDescription>
          检测到昨日未完成答题，已自动使用 {data?.cost ?? 0}{' '}
          积分连胜激冻保护连胜，当前连续答题 {data?.streakDays ?? 0} 天。
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button onClick={() => setData(null)}>知道了</Button>
      </DialogFooter>
    </Dialog>
  )
}
