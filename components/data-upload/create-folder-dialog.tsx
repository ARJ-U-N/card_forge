'use client'

import { useState } from 'react'
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
import { createFolder } from '@/lib/firebase/folder-repository'
import { folderSchema, type FolderValues } from '@/lib/validation/data-upload'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  parentFolderId?: string | null
}

export function CreateFolderDialog({
  open,
  onOpenChange,
  workspaceId,
  parentFolderId = null,
}: Props) {
  const [saving, setSaving] = useState(false)
  const isSubfolder = parentFolderId !== null

  const form = useForm<FolderValues>({
    resolver: zodResolver(folderSchema),
    defaultValues: { name: '', folderTotalNumber: 0 },

  })

  const onSubmit = form.handleSubmit(async (values) => {
    setSaving(true)
    try {
      await createFolder(workspaceId, values.name, parentFolderId, values.folderTotalNumber)
      toast.success(isSubfolder ? 'Subfolder created' : 'Folder created', {
        description: `"${values.name}" has been created.`,
      })
      form.reset()
      onOpenChange(false)
    } catch (error) {
      toast.error('Failed to create', {
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
            {isSubfolder ? 'New Subfolder' : 'New Folder'}
          </DialogTitle>
          <DialogDescription>
            {isSubfolder
              ? 'Create a subfolder to further organize members.'
              : 'Create a folder to organize your member data.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <Field data-invalid={!!form.formState.errors.name || undefined}>
            <FieldLabel htmlFor="folderName">Name</FieldLabel>
            <Input
              id="folderName"
              placeholder={isSubfolder ? 'e.g. Section A' : 'e.g. Class of 2025'}
              disabled={saving}
              autoFocus
              {...form.register('name')}
            />
            <FieldError errors={[form.formState.errors.name]} />
            <Input
              id="FolderTotalNumber"
              type="number"
              placeholder='Enter Total Number'
              disabled={saving}
              {...form.register('folderTotalNumber', { valueAsNumber: true })}

            />
            <FieldError errors={[form.formState.errors.folderTotalNumber]} />
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
              {saving ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
