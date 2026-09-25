'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { renameFolder } from '@/lib/firebase/folder-repository'
import { folderSchema, type FolderValues } from '@/lib/validation/data-upload'
import type { Folder } from '@/lib/models/types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  folder: Folder
}

export function RenameFolderDialog({
  open,
  onOpenChange,
  workspaceId,
  folder,
}: Props) {
  const [saving, setSaving] = useState(false)
  const isSubfolder = folder.parentFolderId !== null

  const form = useForm<FolderValues>({
    resolver: zodResolver(folderSchema),
    defaultValues: { name: folder.name },
  })

  useEffect(() => {
    if (open) form.reset({ name: folder.name })
  }, [open, folder.name, form])

  const onSubmit = form.handleSubmit(async (values) => {
    setSaving(true)
    try {
      await renameFolder(workspaceId, folder.id, values.name)
      toast.success(isSubfolder ? 'Subfolder renamed' : 'Folder renamed', {
        description: `Renamed to "${values.name}".`,
      })
      onOpenChange(false)
    } catch (error) {
      toast.error('Failed to rename', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setSaving(false)
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Rename {isSubfolder ? 'Subfolder' : 'Folder'}
          </DialogTitle>
          <DialogDescription>
            Enter a new name for &ldquo;{folder.name}&rdquo;.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <Field data-invalid={!!form.formState.errors.name || undefined}>
            <FieldLabel htmlFor="renameFolder">Name</FieldLabel>
            <Input
              id="renameFolder"
              disabled={saving}
              autoFocus
              {...form.register('name')}
            />
            <FieldError errors={[form.formState.errors.name]} />
          </Field>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Spinner data-icon="inline-start" />}
              {saving ? 'Renaming…' : 'Rename'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
