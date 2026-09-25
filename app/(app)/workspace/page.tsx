import type { Metadata } from 'next'
import { PageHeader } from '@/components/app/page-header'
import { WorkspaceCard } from '@/components/account/workspace-card'
import { PortalSettingsCard } from '@/components/account/portal-settings-card'

export const metadata: Metadata = { title: 'Workspace' }

export default function WorkspacePage() {
  return (
    <>
      <PageHeader
        title="Workspace"
        description="Organization settings shared by everyone in this workspace."
      />
      <WorkspaceCard />
      <PortalSettingsCard />
    </>
  )
}

