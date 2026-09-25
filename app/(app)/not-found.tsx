import Link from 'next/link'
import { ArrowLeftIcon, CompassIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'

export default function AppNotFound() {
  return (
    <Empty className="flex-1 border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CompassIcon />
        </EmptyMedia>
        <EmptyTitle>Page not found</EmptyTitle>
        <EmptyDescription>
          That route doesn&apos;t exist in this workspace.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button render={<Link href="/dashboard" />}>
          <ArrowLeftIcon data-icon="inline-start" />
          Back to dashboard
        </Button>
      </EmptyContent>
    </Empty>
  )
}
