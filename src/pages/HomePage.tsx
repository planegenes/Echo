import type { ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Layers, ListChecks, FileText, PenLine, BookOpen, Settings } from 'lucide-react'

interface EntryCardProps {
  to: string
  title: string
  desc: string
  icon: ComponentType<{ className?: string }>
  primary?: boolean
}

function EntryCard({ to, title, desc, icon: Icon, primary }: EntryCardProps) {
  return (
    <Link
      to={to}
      className={
        buttonVariants({ variant: primary ? 'default' : 'outline', size: 'lg' }) +
        ' h-auto flex-col items-start gap-2 py-6 text-left'
      }
    >
      <Icon className="h-6 w-6" />
      <div>
        <div className="text-base font-semibold">{title}</div>
        <div className="mt-0.5 text-xs font-normal opacity-80">{desc}</div>
      </div>
    </Link>
  )
}

/**
 * 应用首页：四个入口卡片
 */
export default function HomePage() {
  return (
    <AppShell>
      <div className="grid gap-4 sm:grid-cols-2">
        <EntryCard
          to="/match"
          title="配对测验"
          desc="左右两侧互相匹配，含学习权重"
          icon={Layers}
          primary
        />
        <EntryCard
          to="/choice"
          title="单选匹配"
          desc="根据一侧内容选择对应另一侧"
          icon={ListChecks}
          primary
        />
        <EntryCard
          to="/texts"
          title="填空测验"
          desc="随机抽一段文本做选词/输入填空"
          icon={FileText}
        />
        <EntryCard
          to="/manage"
          title="题库管理"
          desc="新增、编辑、导入导出配对与文本"
          icon={BookOpen}
        />
      </div>

      <Card className="mt-6">
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Settings className="h-4 w-4" />
            <span>配置 AI 接口、深色模式等</span>
          </div>
          <Link
            to="/settings"
            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          >
            <PenLine className="h-4 w-4" />
            打开设置
          </Link>
        </CardContent>
      </Card>
    </AppShell>
  )
}
