'use client'

import { useAuth } from '@/components/providers/auth-provider'
import { useSidebar } from '@/components/ui/sidebar'
import { Badge } from '@/components/ui/badge'

export function WorkspaceBadge() {
  const { workspace } = useAuth()
  const { state } = useSidebar()
  if (!workspace || state === 'collapsed') return null

  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground/80">
      <span className="truncate">
        {workspace.memberIds.length}{' '}
        {workspace.memberIds.length === 1 ? 'member' : 'members'}
      </span>
      <Badge className="bg-sidebar-primary text-sidebar-primary-foreground capitalize">
        {workspace.plan}
      </Badge>
    </div>
  )
}
