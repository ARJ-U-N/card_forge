'use client'

import { useMemo, useState } from 'react'
import {
  CameraIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
  MoveIcon,
  PencilIcon,
  Trash2Icon,
  UserIcon,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getInitials } from '@/lib/utils'
import type { Folder, Member } from '@/lib/models/types'

interface Props {
  members: Member[]
  subfolders: Folder[]
  /** When defined, show these columns from customFields instead of hardcoded ones */
  tableColumns?: string[]
  /** Per-column type metadata. Determines which columns are image columns. */
  tableColumnTypes?: Record<string, 'text' | 'image'>
  selectedIds: Set<string>
  onSelectionChange: (ids: Set<string>) => void
  onEdit: (member: Member) => void
  onDelete: (memberId: string) => void
  onMove: (memberId: string) => void
}

const PAGE_SIZES = [10, 25, 50]

export function MemberTable({
  members,
  subfolders,
  tableColumns,
  tableColumnTypes,
  selectedIds,
  onSelectionChange,
  onEdit,
  onDelete,
  onMove,
}: Props) {
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)

  const totalPages = Math.max(1, Math.ceil(members.length / pageSize))
  const safeCurrentPage = Math.min(page, totalPages - 1)

  const paginated = useMemo(() => {
    const start = safeCurrentPage * pageSize
    return members.slice(start, start + pageSize)
  }, [members, safeCurrentPage, pageSize])

  const subfolderMap = useMemo(() => {
    const map = new Map<string, string>()
    subfolders.forEach((sf) => map.set(sf.id, sf.name))
    return map
  }, [subfolders])

  const allSelected = paginated.length > 0 && paginated.every((m) => selectedIds.has(m.id))
  const someSelected = paginated.some((m) => selectedIds.has(m.id)) && !allSelected

  const toggleAll = () => {
    const next = new Set(selectedIds)
    if (allSelected) {
      paginated.forEach((m) => next.delete(m.id))
    } else {
      paginated.forEach((m) => next.add(m.id))
    }
    onSelectionChange(next)
  }

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectionChange(next)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
              </TableHead>
              {tableColumns && tableColumns.length > 0 ? (
                <>
                  <TableHead className="w-12">#</TableHead>
                  {tableColumns.slice(0, 6).map((col) => (
                    <TableHead key={col}>
                      <span className="inline-flex items-center gap-1">
                        {tableColumnTypes?.[col] === 'image' && (
                          <CameraIcon className="size-3 text-blue-500 shrink-0" />
                        )}
                        {col}
                      </span>
                    </TableHead>
                  ))}
                  {tableColumns.length > 6 && (
                    <TableHead className="text-muted-foreground">
                      +{tableColumns.length - 6}
                    </TableHead>
                  )}
                </>
              ) : (
                <>
                  <TableHead className="w-12">Photo</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Date of Birth</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Subfolder</TableHead>
                </>
              )}
              <TableHead className="w-10">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.map((m) => (
              <TableRow
                key={m.id}
                data-state={selectedIds.has(m.id) ? 'selected' : undefined}
              >
                <TableCell>
                  <Checkbox
                    checked={selectedIds.has(m.id)}
                    onCheckedChange={() => toggleOne(m.id)}
                    aria-label={`Select ${m.firstName || m.customFields?.[tableColumns?.[0] ?? ''] || 'row'}`}
                  />
                </TableCell>
                {tableColumns && tableColumns.length > 0 ? (
                  <>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {m.rowNumber ?? '—'}
                    </TableCell>
                    {tableColumns.slice(0, 6).map((col) => (
                      <TableCell key={col} className="max-w-[200px] truncate">
                        {tableColumnTypes?.[col] === 'image'
                          ? (m.customFields?.[col]
                              ? <img src={m.customFields[col]} alt={col} className="size-8 rounded object-cover" />
                              : <span className="text-muted-foreground">—</span>)
                          : (m.customFields?.[col] || '—')}
                      </TableCell>
                    ))}
                    {tableColumns.length > 6 && (
                      <TableCell className="text-muted-foreground">…</TableCell>
                    )}
                  </>
                ) : (
                  <>
                    <TableCell>
                      <Avatar className="size-8">
                        {m.profileImage && <AvatarImage src={m.profileImage} />}
                        <AvatarFallback className="text-xs">
                          {m.profileImage ? (
                            getInitials(`${m.firstName} ${m.lastName}`)
                          ) : (
                            <UserIcon className="size-3.5" />
                          )}
                        </AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="font-medium">
                      {m.firstName} {m.lastName}
                    </TableCell>
                    <TableCell>{m.dateOfBirth || '—'}</TableCell>
                    <TableCell>{m.title || '—'}</TableCell>
                    <TableCell>
                      {m.subfolderId
                        ? subfolderMap.get(m.subfolderId) ?? '—'
                        : '—'}
                    </TableCell>
                  </>
                )}
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon-sm" />}
                    >
                      <MoreHorizontalIcon />
                      <span className="sr-only">Member actions</span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onMove(m.id)}>
                        <MoveIcon />
                        Move
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onEdit(m)}>
                        <PencilIcon />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => onDelete(m.id)}
                      >
                        <Trash2Icon />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>Rows per page</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v))
              setPage(0)
            }}
          >
            <SelectTrigger size="sm" className="w-16">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <span>
          {members.length === 0
            ? '0 records'
            : `${safeCurrentPage * pageSize + 1}–${Math.min(
                (safeCurrentPage + 1) * pageSize,
                members.length,
              )} of ${members.length} record${members.length !== 1 ? 's' : ''}`}
        </span>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={safeCurrentPage === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            aria-label="Previous page"
          >
            <ChevronLeftIcon />
          </Button>
          <span className="min-w-[4ch] text-center">
            {safeCurrentPage + 1} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={safeCurrentPage >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            aria-label="Next page"
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>
    </div>
  )
}
