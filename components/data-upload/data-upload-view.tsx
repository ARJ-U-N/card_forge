'use client'

import { useEffect, useMemo, useState } from 'react'
import { FolderPlusIcon, SearchIcon, UsersIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/app/page-header'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { useAuth } from '@/components/providers/auth-provider'
import { usePortal } from '@/components/providers/portal-provider'
import { subscribeFolders } from '@/lib/firebase/folder-repository'
import { subscribeAllMembers } from '@/lib/firebase/member-repository'
import type { Folder, Member } from '@/lib/models/types'
import { FolderCard } from './folder-card'
import { CreateFolderDialog } from './create-folder-dialog'

export function DataUploadView() {
  const { user } = useAuth()
  const { isPortalUser, portalFolderId } = usePortal()
  const workspaceId = user?.workspaceId ?? ''

  const [folders, setFolders] = useState<Folder[]>([])
  const [allMembers, setAllMembers] = useState<Member[]>([])
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  // Subscribe to folders
  useEffect(() => {
    if (!workspaceId) return
    setLoading(true)
    const unsub = subscribeFolders(
      workspaceId,
      (f) => {
        setFolders(f)
        setLoading(false)
      },
      () => setLoading(false),
    )
    return unsub
  }, [workspaceId])

  // Subscribe to all members for counts
  useEffect(() => {
    if (!workspaceId) return
    const unsub = subscribeAllMembers(workspaceId, setAllMembers)
    return unsub
  }, [workspaceId])

  // Root folders only (no subfolders)
  // Portal users see only their linked College folder
  const rootFolders = useMemo(() => {
    const roots = folders.filter((f) => f.parentFolderId === null)
    if (isPortalUser && portalFolderId) {
      return roots.filter((f) => f.id === portalFolderId)
    }
    return roots
  }, [folders, isPortalUser, portalFolderId])

  // Search filter
  const filtered = useMemo(() => {
    if (!search.trim()) return rootFolders
    const q = search.toLowerCase()
    return rootFolders.filter((f) => f.name.toLowerCase().includes(q))
  }, [rootFolders, search])

  // Count helpers
  const getMemberCount = (folderId: string) =>
    allMembers.filter((m) => m.folderId === folderId).length
  const getSubfolderCount = (folderId: string) =>
    folders.filter((f) => f.parentFolderId === folderId).length
  const totalMembers = allMembers.length

  return (
    <>
      <PageHeader
        title="Data Upload"
        description={
          isPortalUser
            ? 'Manage member records for your College.'
            : 'Manage folders, subfolders and member records for your workspace.'
        }
        actions={
          !isPortalUser ? (
            <Button onClick={() => setCreateOpen(true)}>
              <FolderPlusIcon data-icon="inline-start" />
              New Folder
            </Button>
          ) : undefined
        }
      />

      {/* Search + stats bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-xs flex-1">
          <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search folders…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <UsersIcon className="size-4" />
          <span>{totalMembers} total member{totalMembers !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Folder grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-36 animate-pulse rounded-xl bg-muted"
            />
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((folder) => (
            <FolderCard
              key={folder.id}
              folder={folder}
              folderTotalNumber={folder.folderTotalNumber ?? 0}
              memberCount={getMemberCount(folder.id)}
              subfolderCount={getSubfolderCount(folder.id)}
              workspaceId={workspaceId}
            />
          ))}
        </div>
      ) : search.trim() ? (
        <Empty className="flex-1 border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchIcon />
            </EmptyMedia>
            <EmptyTitle>No folders match &ldquo;{search}&rdquo;</EmptyTitle>
            <EmptyDescription>
              Try a different search term or create a new folder.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => setSearch('')}>
              Clear search
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <Empty className="flex-1 border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderPlusIcon />
            </EmptyMedia>
            <EmptyTitle>No folders yet</EmptyTitle>
            <EmptyDescription>
              Create your first folder to start organising member data.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setCreateOpen(true)}>
              <FolderPlusIcon data-icon="inline-start" />
              New Folder
            </Button>
          </EmptyContent>
        </Empty>
      )}

      <CreateFolderDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        workspaceId={workspaceId}
      />
    </>
  )
}
