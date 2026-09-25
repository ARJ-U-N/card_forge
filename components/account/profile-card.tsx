'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
import { formatDate, getInitials } from '@/lib/utils'

export function ProfileCard() {
  const { user, firebaseUser, isProfileLoading } = useAuth()

  if (isProfileLoading || !user) {
    return <Skeleton className="h-64 w-full max-w-2xl" />
  }

  const rows = [
    { label: 'Email', value: user.email },
    { label: 'Job title', value: user.profile.jobTitle ?? 'Not set' },
    { label: 'Phone', value: user.profile.phone ?? 'Not set' },
    { label: 'Member since', value: formatDate(user.createdAt) },
    {
      label: 'Email verified',
      value: firebaseUser?.emailVerified ? 'Yes' : 'Pending',
    },
  ]

  return (
    <Card className="max-w-2xl">
      <CardHeader className="flex flex-row items-center gap-4">
        <Avatar className="size-14">
          <AvatarImage src={user.profile.photoURL ?? undefined} alt="" />
          <AvatarFallback className="bg-primary text-primary-foreground text-lg">
            {getInitials(user.profile.displayName)}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-1">
          <CardTitle className="text-lg">{user.profile.displayName}</CardTitle>
          <CardDescription className="flex items-center gap-2">
            <Badge variant="secondary" className="capitalize">
              {user.role}
            </Badge>
            <span className="font-mono text-xs">{user.id}</span>
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.label} className="flex flex-col gap-1">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {row.label}
              </dt>
              <dd className="text-sm font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
