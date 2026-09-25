'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { CameraIcon, PlusIcon, Trash2Icon, TableIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
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
import { updateFolderColumns } from '@/lib/firebase/folder-repository'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  folderId: string
  /** Existing table columns — when provided, the dialog opens in edit mode */
  existingColumns?: string[]
  /** Existing per-column type map */
  existingColumnTypes?: Record<string, 'text' | 'image'>
}

export function CreateTableDialog({
  open,
  onOpenChange,
  workspaceId,
  folderId,
  existingColumns,
  existingColumnTypes,
}: Props) {
  const isEdit = existingColumns && existingColumns.length > 0
  const [columns, setColumns] = useState<string[]>(
    existingColumns?.length ? [...existingColumns] : [''],
  )
  const [columnTypes, setColumnTypes] = useState<Record<string, 'text' | 'image'>>(
    existingColumnTypes ? { ...existingColumnTypes } : {},
  )
  const [saving, setSaving] = useState(false)

  // Reset when dialog opens
  const handleOpenChange = (v: boolean) => {
    if (v) {
      setColumns(existingColumns?.length ? [...existingColumns] : [''])
      setColumnTypes(existingColumnTypes ? { ...existingColumnTypes } : {})
    }
    onOpenChange(v)
  }

  const addColumn = () => {
    setColumns((prev) => [...prev, ''])
  }

  const removeColumn = (index: number) => {
    const colName = columns[index]
    setColumns((prev) => prev.filter((_, i) => i !== index))
    if (colName) {
      setColumnTypes((prev) => {
        const next = { ...prev }
        delete next[colName]
        return next
      })
    }
  }

  const updateColumn = (index: number, value: string) => {
    const oldName = columns[index]
    setColumns((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
    // Transfer the type if the column name changed
    if (oldName && oldName !== value) {
      setColumnTypes((prev) => {
        const next = { ...prev }
        const oldType = next[oldName]
        delete next[oldName]
        if (value.trim() && oldType) {
          next[value] = oldType
        }
        return next
      })
    }
  }

  const toggleColumnType = (colName: string) => {
    setColumnTypes((prev) => {
      const next = { ...prev }
      if (next[colName] === 'image') {
        delete next[colName] // defaults to 'text'
      } else {
        next[colName] = 'image'
      }
      return next
    })
  }

  const handleSave = async () => {
    // Filter out empty column names and trim whitespace
    const cleaned = columns
      .map((c) => c.trim())
      .filter((c) => c.length > 0)

    if (cleaned.length === 0) {
      toast.error('Add at least one column heading.')
      return
    }

    // Check for duplicates
    const unique = new Set(cleaned)
    if (unique.size !== cleaned.length) {
      toast.error('Column headings must be unique.')
      return
    }

    // Build cleaned column types — only include entries for columns that exist
    const cleanedTypes: Record<string, 'text' | 'image'> = {}
    for (const col of cleaned) {
      if (columnTypes[col] === 'image') {
        cleanedTypes[col] = 'image'
      }
    }

    setSaving(true)
    try {
      await updateFolderColumns(
        workspaceId,
        folderId,
        cleaned,
        false,
        cleanedTypes,
      )
      toast.success(
        isEdit
          ? `Table updated with ${cleaned.length} column${cleaned.length !== 1 ? 's' : ''}`
          : `Table created with ${cleaned.length} column${cleaned.length !== 1 ? 's' : ''}`,
      )
      onOpenChange(false)
    } catch (error) {
      toast.error('Failed to save table', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TableIcon className="size-4" />
            {isEdit ? 'Edit Table Columns' : 'Create Table'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Modify the column headings for this folder\'s table. Use the camera icon to mark image columns.'
              : 'Define the column headings for your data table. Use the camera icon to mark image columns (e.g., Photo, Signature).'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 overflow-auto pr-1">
          {columns.map((col, i) => {
            const isImage = col.trim() ? columnTypes[col.trim()] === 'image' : false
            return (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-6 text-right shrink-0">
                  {i + 1}.
                </span>
                <Input
                  placeholder={`Column ${i + 1} heading`}
                  value={col}
                  onChange={(e) => updateColumn(i, e.target.value)}
                  autoFocus={i === columns.length - 1}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addColumn()
                    }
                  }}
                />
                <Button
                  variant={isImage ? 'default' : 'ghost'}
                  size="icon-sm"
                  onClick={() => col.trim() && toggleColumnType(col.trim())}
                  disabled={!col.trim()}
                  title={isImage ? 'Image column (click to change to text)' : 'Text column (click to change to image)'}
                  className={cn(
                    'shrink-0',
                    isImage && 'bg-blue-600 hover:bg-blue-700 text-white',
                  )}
                >
                  <CameraIcon className="size-3.5" />
                  <span className="sr-only">{isImage ? 'Image column' : 'Text column'}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeColumn(i)}
                  disabled={columns.length <= 1}
                >
                  <Trash2Icon className="size-3.5" />
                  <span className="sr-only">Remove column</span>
                </Button>
              </div>
            )
          })}

          <Button
            variant="outline"
            size="sm"
            onClick={addColumn}
            className="mt-1"
          >
            <PlusIcon data-icon="inline-start" />
            Add Column
          </Button>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Spinner data-icon="inline-start" />}
            {isEdit ? 'Save Changes' : 'Create Table'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
