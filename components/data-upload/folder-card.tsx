'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  FolderIcon,
  FolderOpenIcon,
  GlobeIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
  UsersIcon,
  FolderTreeIcon,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardAction,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Folder } from '@/lib/models/types'
import { usePortal } from '@/components/providers/portal-provider'
import { RenameFolderDialog } from './rename-folder-dialog'
import { DeleteFolderDialog } from './delete-folder-dialog'
import { PortalSettingsDialog } from './portal-settings-dialog'

interface FolderCardProps {
  folder: Folder
  folderTotalNumber: number
  memberCount: number
  subfolderCount: number
  workspaceId: string
}

export function FolderCard({
  folder,
  folderTotalNumber,
  memberCount,
  subfolderCount,
  workspaceId,
}: FolderCardProps) {
  const router = useRouter()
  const { isPortalUser } = usePortal()
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [portalOpen, setPortalOpen] = useState(false)

  const handleOpen = () => {
    router.push(`/data-upload/${folder.id}`)
  }

  return (
    <>
      <Card
        className="cursor-pointer transition-shadow hover:ring-2 hover:ring-ring/30"
        onClick={handleOpen}
      >
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FolderIcon className="size-4" />
            </div>
            <CardTitle className="truncate">{folder.name}</CardTitle>
            <span className="shrink-0 text-sm font-medium text-red-500">
              {folderTotalNumber}
            </span>
          </div>
          <CardAction>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => e.stopPropagation()}
                  />
                }
              >
                <MoreHorizontalIcon />
                <span className="sr-only">Folder actions</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    handleOpen()
                  }}
                >
                  <FolderOpenIcon />
                  Open
                </DropdownMenuItem>
                {!isPortalUser && (
                  <>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation()
                        setPortalOpen(true)
                      }}
                    >
                      <GlobeIcon />
                      Portal
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation()
                        setRenameOpen(true)
                      }}
                    >
                      <PencilIcon />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteOpen(true)
                      }}
                    >
                      <Trash2Icon />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <UsersIcon className="size-3.5" />
              {memberCount} member{memberCount !== 1 ? 's' : ''}
            </span>
            <span className="inline-flex items-center gap-1">
              <FolderTreeIcon className="size-3.5" />
              {subfolderCount} subfolder{subfolderCount !== 1 ? 's' : ''}
            </span>
          </div>
        </CardContent>
      </Card>

      <RenameFolderDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        workspaceId={workspaceId}
        folder={folder}
      />
      <DeleteFolderDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        workspaceId={workspaceId}
        folder={folder}
      />
      {portalOpen && (
        <PortalSettingsDialog
          open={portalOpen}
          onOpenChange={setPortalOpen}
          initialFolderId={folder.id}
          initialFolderName={folder.name}
        />
      )}
    </>
  )
}

