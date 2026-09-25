'use client'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/components/providers/auth-provider'
import { formatDate } from '@/lib/utils'

export function WorkspaceCard() {
  const { workspace, user } = useAuth()

  if (!workspace || !user) {
    return <Skeleton className="h-56 w-full max-w-2xl" />
  }

  const rows = [
    { label: 'Workspace ID', value: workspace.id, mono: true },
    { label: 'Owner', value: workspace.ownerId === user.id ? 'You' : workspace.ownerId, mono: workspace.ownerId !== user.id },
    { label: 'Members', value: String(workspace.memberIds.length) },
    { label: 'Created', value: formatDate(workspace.createdAt) },
  ]

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          {workspace.name}
          <Badge className="bg-highlight text-highlight-foreground capitalize">
            {workspace.plan}
          </Badge>
        </CardTitle>
        <CardDescription>
          Member management, roles and billing arrive in a later phase.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.label} className="flex flex-col gap-1">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {row.label}
              </dt>
              <dd
                className={
                  row.mono ? 'truncate font-mono text-sm' : 'text-sm font-medium'
                }
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
