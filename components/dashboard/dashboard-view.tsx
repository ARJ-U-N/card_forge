'use client'

import Link from 'next/link'
import { PenToolIcon, PlayCircleIcon, UploadIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app/page-header'
import { StatCards } from '@/components/dashboard/stat-cards'
import { RecentMembers } from '@/components/dashboard/recent-members'
import { WorkspaceSummary } from '@/components/dashboard/workspace-summary'
import { TourDialog } from '@/components/dashboard/tour-dialog'
import { useAuth } from '@/components/providers/auth-provider'
import { usePortal } from '@/components/providers/portal-provider'

export function DashboardView() {
  const { user, firebaseUser } = useAuth()
  const { isPortalUser, portalFolderName } = usePortal()

  const firstName = (
    user?.profile.displayName ||
    firebaseUser?.displayName ||
    ''
  ).split(' ')[0]

  const title = isPortalUser
    ? portalFolderName
      ? `${portalFolderName} — Dashboard`
      : 'College Portal Dashboard'
    : firstName
      ? `Welcome back, ${firstName}`
      : 'Dashboard'

  const description = isPortalUser
    ? 'Overview of your College data and activity.'
    : 'Track templates, verified members and departments across your workspace.'

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          <>
            {/* Hide Replay Tour for portal users */}
            {!isPortalUser && (
              <TourDialog
                trigger={
                  <Button variant="outline">
                    <PlayCircleIcon data-icon="inline-start" />
                    Replay Tour
                  </Button>
                }
              />
            )}
            <Button variant="secondary" nativeButton={false} render={<Link href="/data-upload" />}>
              <UploadIcon data-icon="inline-start" />
              Upload Data
            </Button>
            <Button nativeButton={false} render={<Link href="/designer" />}>
              <PenToolIcon data-icon="inline-start" />
              New Design
            </Button>
          </>
        }
      />

      <StatCards />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <RecentMembers />
        <WorkspaceSummary />
      </div>
    </>
  )
}
