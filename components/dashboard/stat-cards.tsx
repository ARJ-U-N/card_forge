import Link from 'next/link'
import {
  ArrowUpRightIcon,
  BadgeCheckIcon,
  FolderTreeIcon,
  LayoutTemplateIcon,
  type LucideIcon,
} from 'lucide-react'
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface Stat {
  label: string
  value: number
  hint: string
  icon: LucideIcon
  href: string
}

/** Values are zero until later phases populate templates, members and departments. */
const STATS: Stat[] = [
  {
    label: 'Active Templates',
    value: 0,
    hint: 'Card designs ready for generation',
    icon: LayoutTemplateIcon,
    href: '/designer',
  },
  {
    label: 'Verified Members',
    value: 0,
    hint: 'Records with complete required fields',
    icon: BadgeCheckIcon,
    href: '/data-upload',
  },
  {
    label: 'Departments',
    value: 0,
    hint: 'Groups used to organize members',
    icon: FolderTreeIcon,
    href: '/data-upload',
  },
]

export function StatCards() {
  return (
    <section aria-label="Workspace statistics" className="grid gap-4 md:grid-cols-3">
      {STATS.map((stat) => (
        <Card key={stat.label}>
          <CardHeader>
            <CardDescription className="flex items-center gap-2">
              <stat.icon className="size-4" aria-hidden="true" />
              {stat.label}
            </CardDescription>
            <CardTitle className="font-mono text-3xl tabular-nums">
              {stat.value.toLocaleString()}
            </CardTitle>
            <CardDescription>{stat.hint}</CardDescription>
            <CardAction>
              <Button
                variant="ghost"
                size="icon-sm"
                nativeButton={false}
                aria-label={`Open ${stat.label}`}
                render={<Link href={stat.href} />}
              >
                <ArrowUpRightIcon />
              </Button>
            </CardAction>
          </CardHeader>
        </Card>
      ))}
    </section>
  )
}
