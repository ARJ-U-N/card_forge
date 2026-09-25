import Link from 'next/link'
import { ArrowLeftIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { PageHeader } from '@/components/app/page-header'
import type { NavItem } from '@/components/app/nav-config'

export function ModulePlaceholder({
  item,
  phase,
  bullets,
}: {
  item: NavItem
  phase: string
  bullets: string[]
}) {
  return (
    <>
      <PageHeader title={item.title} description={item.description} />
      <Empty className="flex-1 border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <item.icon />
          </EmptyMedia>
          <EmptyTitle>{item.title} is coming in {phase}</EmptyTitle>
          <EmptyDescription>
            This module is wired into navigation and protected by your
            workspace session. Its functionality will be built in a later phase.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <ul className="flex flex-wrap justify-center gap-2">
            {bullets.map((bullet) => (
              <li key={bullet}>
                <Badge variant="secondary">{bullet}</Badge>
              </li>
            ))}
          </ul>
          <Button variant="outline" render={<Link href="/dashboard" />}>
            <ArrowLeftIcon data-icon="inline-start" />
            Back to dashboard
          </Button>
        </EmptyContent>
      </Empty>
    </>
  )
}
