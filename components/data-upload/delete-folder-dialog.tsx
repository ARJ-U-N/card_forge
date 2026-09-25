'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Trash2Icon } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { deleteFolder } from '@/lib/firebase/folder-repository'
import type { Folder } from '@/lib/models/types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  folder: Folder
  /** Called after successful deletion, e.g. to navigate away */
  onDeleted?: () => void
}

export function DeleteFolderDialog({
  open,
  onOpenChange,
  workspaceId,
  folder,
  onDeleted,
}: Props) {
  const [deleting, setDeleting] = useState(false)
  const isSubfolder = folder.parentFolderId !== null

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteFolder(workspaceId, folder.id)
      toast.success(isSubfolder ? 'Subfolder deleted' : 'Folder deleted', {
        description: `"${folder.name}" and all its contents have been removed.`,
      })
      onOpenChange(false)
      onDeleted?.()
    } catch (error) {
      toast.error('Failed to delete', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive">
            <Trash2Icon />
          </AlertDialogMedia>
          <AlertDialogTitle>
            Delete {isSubfolder ? 'subfolder' : 'folder'} &ldquo;{folder.name}&rdquo;?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the {isSubfolder ? 'subfolder' : 'folder'},
            all its {!isSubfolder ? 'subfolders and ' : ''}members. This action cannot
            be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting && <Spinner data-icon="inline-start" />}
            {deleting ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
