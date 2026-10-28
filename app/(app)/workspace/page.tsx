import type { Metadata } from 'next'
import { Suspense } from 'react'
import { PageHeader } from '@/components/app/page-header'
import { WorkspaceCard } from '@/components/account/workspace-card'
import { PortalSettingsCard } from '@/components/account/portal-settings-card'
import { DriveConnectionCard } from '@/components/account/drive-connection-card'
import { Skeleton } from '@/components/ui/skeleton'

export const metadata: Metadata = { title: 'Workspace' }

export default function WorkspacePage() {
  return (
    <>
      <PageHeader
        title="Workspace"
        description="Organization settings shared by everyone in this workspace."
      />
      <WorkspaceCard />
      <Suspense fallback={<Skeleton className="h-40 w-full max-w-2xl" />}>
        <DriveConnectionCard />
      </Suspense>
      <PortalSettingsCard />
    </>
  )
}

