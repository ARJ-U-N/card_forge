'use client'

import Link from 'next/link'
import { SchoolIcon, SettingsIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/components/providers/auth-provider'
import { usePortal } from '@/components/providers/portal-provider'
import { formatDate } from '@/lib/utils'

export function WorkspaceSummary() {
  const { workspace, user } = useAuth()
  const { isPortalUser, portalFolderName } = usePortal()

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isPortalUser ? 'College Portal' : 'Workspace'}
        </CardTitle>
        <CardDescription>
          {isPortalUser
            ? 'Your portal access details.'
            : 'Your organization at a glance.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {workspace && user ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-lg font-medium">
                {isPortalUser ? portalFolderName ?? 'College' : workspace.name}
              </span>
              {isPortalUser ? (
                <Badge className="bg-blue-500/10 text-blue-700 capitalize">
                  <SchoolIcon className="mr-1 size-3" />
                  Portal
                </Badge>
              ) : (
                <Badge className="bg-highlight text-highlight-foreground capitalize">
                  {workspace.plan}
                </Badge>
              )}
            </div>
            <Separator />
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Your role</dt>
                <dd className="font-medium capitalize">{user.role}</dd>
              </div>
              {!isPortalUser && (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Members</dt>
                    <dd className="font-mono tabular-nums">{workspace.memberIds.length}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Created</dt>
                    <dd>{formatDate(workspace.createdAt)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Workspace ID</dt>
                    <dd className="max-w-40 truncate font-mono text-xs">{workspace.id}</dd>
                  </div>
                </>
              )}
              {isPortalUser && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="max-w-40 truncate text-xs">{user.email}</dd>
                </div>
              )}
            </dl>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        )}
      </CardContent>
      {/* Hide Manage workspace for portal users */}
      {!isPortalUser && (
        <CardFooter>
          <Button variant="outline" className="w-full" nativeButton={false} render={<Link href="/workspace" />}>
            <SettingsIcon data-icon="inline-start" />
            Manage workspace
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
