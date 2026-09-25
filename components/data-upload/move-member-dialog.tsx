'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { FolderIcon, MoveIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { moveMembers } from '@/lib/firebase/member-repository'
import type { Folder } from '@/lib/models/types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  memberIds: string[]
  folders: Folder[]
  subfolders: Folder[]
  onMoved?: () => void
}

export function MoveMemberDialog({
  open,
  onOpenChange,
  workspaceId,
  memberIds,
  folders,
  subfolders,
  onMoved,
}: Props) {
  const [targetFolder, setTargetFolder] = useState<string>('')
  const [targetSubfolder, setTargetSubfolder] = useState<string>('__none__')
  const [moving, setMoving] = useState(false)

  const count = memberIds.length
  const availableSubfolders = subfolders.filter(
    (sf) => sf.parentFolderId === targetFolder,
  )

  const handleMove = async () => {
    if (!targetFolder) {
      toast.error('Select a folder')
      return
    }
    setMoving(true)
    try {
      await moveMembers(
        workspaceId,
        memberIds,
        targetFolder,
        targetSubfolder === '__none__' ? null : targetSubfolder,
      )
      toast.success(
        `${count} member${count !== 1 ? 's' : ''} moved`,
      )
      onOpenChange(false)
      onMoved?.()
    } catch (error) {
      toast.error('Failed to move', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setMoving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MoveIcon className="size-4" />
            Move {count} member{count !== 1 ? 's' : ''}
          </DialogTitle>
          <DialogDescription>
            Select the destination folder and optional subfolder.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Folder</label>
            <Select value={targetFolder} onValueChange={(v) => {
              setTargetFolder(v)
              setTargetSubfolder('__none__')
            }}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a folder" />
              </SelectTrigger>
              <SelectContent>
                {folders.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    <FolderIcon className="size-3.5" />
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {availableSubfolders.length > 0 && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Subfolder (optional)</label>
              <Select
                value={targetSubfolder}
                onValueChange={setTargetSubfolder}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None (root)</SelectItem>
                  {availableSubfolders.map((sf) => (
                    <SelectItem key={sf.id} value={sf.id}>
                      {sf.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={moving}
          >
            Cancel
          </Button>
          <Button onClick={handleMove} disabled={moving || !targetFolder}>
            {moving && <Spinner data-icon="inline-start" />}
            {moving ? 'Moving…' : 'Move'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
