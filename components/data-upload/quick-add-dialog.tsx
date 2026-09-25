'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { PlusIcon, Trash2Icon, ZapIcon } from 'lucide-react'
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
import { createManyMembers } from '@/lib/firebase/member-repository'
import { quickAddRowSchema } from '@/lib/validation/data-upload'

interface Row {
  firstName: string
  lastName: string
  dateOfBirth: string
  title: string
  gender: string
  employeeId: string
  department: string
  hireDate: string
  expireDate: string
  parentPhone: string
  roomId: string
  error?: string
}

const emptyRow = (): Row => ({
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  title: '',
  gender: '',
  employeeId: '',
  department: '',
  hireDate: '',
  expireDate: '',
  parentPhone: '',
  roomId: '',
})

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  folderId: string
}

export function QuickAddDialog({
  open,
  onOpenChange,
  workspaceId,
  folderId,
}: Props) {
  const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow(), emptyRow()])
  const [saving, setSaving] = useState(false)

  const updateRow = (index: number, field: keyof Row, value: string) => {
    setRows((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value, error: undefined }
      return next
    })
  }

  const addRow = () => setRows((prev) => [...prev, emptyRow()])

  const clearAll = () => setRows([emptyRow(), emptyRow(), emptyRow()])

  const handleSave = async () => {
    // Validate all rows
    const validated: Row[] = []
    let hasError = false
    const updatedRows = rows.map((row) => {
      const result = quickAddRowSchema.safeParse(row)
      if (!result.success) {
        const msg = result.error.issues.map((i) => i.message).join(', ')
        hasError = true
        return { ...row, error: msg }
      }
      validated.push({ ...row, error: undefined })
      return { ...row, error: undefined }
    })

    // Filter out truly empty rows
    const nonEmpty = validated.filter(
      (r) => r.firstName.trim() || r.lastName.trim(),
    )

    if (nonEmpty.length === 0) {
      setRows(updatedRows)
      toast.error('No valid rows', {
        description: 'Add at least one row with first and last name.',
      })
      return
    }

    if (hasError) {
      setRows(updatedRows)
    }

    setSaving(true)
    try {
      const members = nonEmpty.map((r) => ({
        folderId,
        subfolderId: null,
        firstName: r.firstName.trim(),
        lastName: r.lastName.trim(),
        dateOfBirth: r.dateOfBirth,
        title: r.title,
        gender: r.gender as '' | 'male' | 'female' | 'other',
        employeeId: r.employeeId,
        idNumber: '',
        department: r.department,
        hireDate: r.hireDate,
        expireDate: r.expireDate,
        parentPhone: r.parentPhone,
        branch: '',
        roomId: r.roomId,
        profileImage: '',
        signature: '',
        fingerprint: '',
        divisionLogo: '',
        customFields: {},
      }))

      const count = await createManyMembers(workspaceId, members)
      toast.success(`${count} member${count !== 1 ? 's' : ''} added`)
      clearAll()
      onOpenChange(false)
    } catch (error) {
      toast.error('Failed to save members', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setSaving(false)
    }
  }

  const fields: { key: keyof Row; label: string; type?: string; width?: string }[] = [
    { key: 'firstName', label: 'First Name *', width: 'min-w-[120px]' },
    { key: 'lastName', label: 'Last Name *', width: 'min-w-[120px]' },
    { key: 'dateOfBirth', label: 'DOB', type: 'date', width: 'min-w-[130px]' },
    { key: 'title', label: 'Title', width: 'min-w-[100px]' },
    { key: 'gender', label: 'Gender', width: 'min-w-[90px]' },
    { key: 'employeeId', label: 'Emp. ID', width: 'min-w-[100px]' },
    { key: 'department', label: 'Dept.', width: 'min-w-[100px]' },
    { key: 'hireDate', label: 'Hire', type: 'date', width: 'min-w-[130px]' },
    { key: 'expireDate', label: 'Expire', type: 'date', width: 'min-w-[130px]' },
    { key: 'parentPhone', label: 'Phone', width: 'min-w-[110px]' },
    { key: 'roomId', label: 'Room', width: 'min-w-[80px]' },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ZapIcon className="size-4" />
            Quick Add Members
          </DialogTitle>
          <DialogDescription>
            Enter multiple members in a spreadsheet-style view. First and last name are required.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-muted">
              <tr>
                <th className="p-2 text-left font-medium text-muted-foreground w-8">#</th>
                {fields.map((f) => (
                  <th
                    key={f.key}
                    className={`p-2 text-left font-medium text-muted-foreground ${f.width ?? ''}`}
                  >
                    {f.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={i}
                  className={`border-t ${row.error ? 'bg-destructive/5' : ''}`}
                >
                  <td className="p-1 text-center text-muted-foreground">{i + 1}</td>
                  {fields.map((f) => (
                    <td key={f.key} className="p-1">
                      <Input
                        type={f.type ?? 'text'}
                        value={(row[f.key] as string) ?? ''}
                        onChange={(e) => updateRow(i, f.key, e.target.value)}
                        className="h-7 text-xs"
                        disabled={saving}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <DialogFooter className="flex-wrap">
          <div className="flex flex-1 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addRow}
              disabled={saving}
            >
              <PlusIcon data-icon="inline-start" />
              Add Row
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearAll}
              disabled={saving}
            >
              <Trash2Icon data-icon="inline-start" />
              Clear
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving && <Spinner data-icon="inline-start" />}
            {saving ? 'Saving…' : 'Save All'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
