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
import { deleteMembers } from '@/lib/firebase/member-repository'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  memberIds: string[]
  onDeleted?: () => void
}

export function DeleteMemberDialog({
  open,
  onOpenChange,
  workspaceId,
  memberIds,
  onDeleted,
}: Props) {
  const [deleting, setDeleting] = useState(false)
  const count = memberIds.length

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteMembers(workspaceId, memberIds)
      toast.success(
        `${count} member${count !== 1 ? 's' : ''} deleted`,
      )
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
            Delete {count} member{count !== 1 ? 's' : ''}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove the selected member
            {count !== 1 ? 's' : ''} and all associated data.
            This action cannot be undone.
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
