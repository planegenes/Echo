import { useAtom } from 'jotai'
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { completionCanceledAtom } from '@/store/dailyStreak'

/**
 * 连错惩罚提示弹框
 * 连续答错达到 10 题且当天已有「正常」打卡时，打卡被取消并弹出本提示
 */
export function CompletionCanceledDialog() {
  const [open, setOpen] = useAtom(completionCanceledAtom)

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setOpen(false)
      }}
    >
      <DialogHeader>
        <DialogTitle>今日打卡已被撤销</DialogTitle>
        <DialogDescription>重新答题打卡吧</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button onClick={() => setOpen(false)}>知道了</Button>
      </DialogFooter>
    </Dialog>
  )
}
