'use client'

import { useMemo, useState } from 'react'
import {
  FolderIcon,
  FolderPlusIcon,
  LinkIcon,
  PencilIcon,
  SearchIcon,
  Trash2Icon,
  UsersIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Folder, Member } from '@/lib/models/types'
import { CreateFolderDialog } from './create-folder-dialog'
import { RenameFolderDialog } from './rename-folder-dialog'
import { DeleteFolderDialog } from './delete-folder-dialog'
import { ShareLinkDialog } from './share-link-dialog'

interface Props {
  workspaceId: string
  folderId: string
  /** The parent/main College folder (for share link context). */
  parentFolder: Folder | null
  subfolders: Folder[]
  members: Member[]
  selectedSubfolder: string | null
  onSelectSubfolder: (id: string | null) => void
  /** When true, editing controls (create/rename/delete subfolder) are hidden. */
  isLocked?: boolean
}

export function SubfolderPanel({
  workspaceId,
  folderId,
  parentFolder,
  subfolders,
  members,
  selectedSubfolder,
  onSelectSubfolder,
  isLocked = false,
}: Props) {
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [renameFolder, setRenameFolder] = useState<Folder | null>(null)
  const [deleteFolder, setDeleteFolder] = useState<Folder | null>(null)
  const [shareFolder, setShareFolder] = useState<Folder | null>(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return subfolders
    const q = search.toLowerCase()
    return subfolders.filter((sf) => sf.name.toLowerCase().includes(q))
  }, [subfolders, search])

  const countInSubfolder = (subfolderId: string) =>
    members.filter((m) => m.subfolderId === subfolderId).length

  const countInRoot = members.filter((m) => !m.subfolderId).length

  return (
    <>
      <div className="flex w-full flex-col gap-2 rounded-xl border bg-card p-3 lg:w-60 lg:shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Subfolders
          </span>
          {!isLocked && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setCreateOpen(true)}
              aria-label="New subfolder"
            >
              <FolderPlusIcon />
            </Button>
          )}
        </div>

        {subfolders.length > 3 && (
          <div className="relative">
            <SearchIcon className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 pl-7 text-xs"
            />
          </div>
        )}

        {/* "All" option */}
        <button
          type="button"
          onClick={() => onSelectSubfolder(null)}
          className={cn(
            'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted',
            selectedSubfolder === null && 'bg-muted font-medium',
          )}
        >
          <UsersIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate">All Members</span>
          <span className="text-muted-foreground">{members.length}</span>
        </button>

        {/* Root (no subfolder) */}
        <button
          type="button"
          onClick={() => onSelectSubfolder('__root__')}
          className={cn(
            'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted',
            selectedSubfolder === '__root__' && 'bg-muted font-medium',
          )}
        >
          <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate">Unsorted</span>
          <span className="text-muted-foreground">{countInRoot}</span>
        </button>

        {/* Subfolders list */}
        {filtered.map((sf) => (
          <div key={sf.id} className="group flex items-center gap-1">
            <button
              type="button"
              onClick={() => onSelectSubfolder(sf.id)}
              className={cn(
                'flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted',
                selectedSubfolder === sf.id && 'bg-muted font-medium',
              )}
            >
              <FolderIcon className="size-3.5 shrink-0 text-primary/70" />
              <span className="flex-1 truncate">{sf.name}</span>
              <span className="text-muted-foreground">
                {sf.folderTotalNumber
                  ? `${sf.folderTotalNumber}/${countInSubfolder(sf.id)}`
                  : countInSubfolder(sf.id)}
              </span>
            </button>
            <div className="hidden gap-0.5 group-hover:flex">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setShareFolder(sf)}
                aria-label={`Share ${sf.name}`}
              >
                <LinkIcon />
              </Button>
              {!isLocked && (
                <>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setRenameFolder(sf)}
                    aria-label={`Rename ${sf.name}`}
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setDeleteFolder(sf)}
                    aria-label={`Delete ${sf.name}`}
                  >
                    <Trash2Icon />
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}

        {subfolders.length === 0 && (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">
            No subfolders yet.
          </p>
        )}
      </div>

      <CreateFolderDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        workspaceId={workspaceId}
        parentFolderId={folderId}
      />

      {renameFolder && (
        <RenameFolderDialog
          open
          onOpenChange={(open) => {
            if (!open) setRenameFolder(null)
          }}
          workspaceId={workspaceId}
          folder={renameFolder}
        />
      )}

      {deleteFolder && (
        <DeleteFolderDialog
          open
          onOpenChange={(open) => {
            if (!open) setDeleteFolder(null)
          }}
          workspaceId={workspaceId}
          folder={deleteFolder}
        />
      )}

      {shareFolder && parentFolder && (
        <ShareLinkDialog
          open
          onOpenChange={(open) => {
            if (!open) setShareFolder(null)
          }}
          workspaceId={workspaceId}
          folder={parentFolder}
          subfolder={shareFolder}
        />
      )}
    </>
  )
}
