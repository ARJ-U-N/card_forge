'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  DownloadIcon,
  FileSpreadsheetIcon,
  ImageIcon,
  LayersIcon,
  LockIcon,
  PlusIcon,
  SearchIcon,
  SendIcon,
  TableIcon,
  UploadIcon,
  ZapIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/app/page-header'
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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { useAuth } from '@/components/providers/auth-provider'
import { usePortal } from '@/components/providers/portal-provider'
import { subscribeFolders, getFolder, submitFolder } from '@/lib/firebase/folder-repository'
import { subscribeMembers } from '@/lib/firebase/member-repository'
import { exportMembersToXlsx, exportFolderDataToXlsx } from '@/lib/export-members'
import type { Folder, Member } from '@/lib/models/types'
import { MemberTable } from './member-table'
import { SubfolderPanel } from './subfolder-panel'
import { AddMemberDialog } from './add-member-dialog'
import { QuickAddDialog } from './quick-add-dialog'
import { ImportDialog } from './import-dialog'
import { CreateTableDialog } from './create-table-dialog'
import { DeleteMemberDialog } from './delete-member-dialog'
import { MoveMemberDialog } from './move-member-dialog'
import { BulkImageDialog } from './bulk-image-dialog'

interface Props {
  folderId: string
}

export function FolderDetailView({ folderId }: Props) {
  const { user } = useAuth()
  const { isPortalUser, portalFolderId } = usePortal()
  const router = useRouter()
  const workspaceId = user?.workspaceId ?? ''
  const isOwner = user?.role === 'owner'

  const [folder, setFolder] = useState<Folder | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [allFolders, setAllFolders] = useState<Folder[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedSubfolder, setSelectedSubfolder] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Dialog states
  const [addOpen, setAddOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [createTableOpen, setCreateTableOpen] = useState(false)
  const [editMember, setEditMember] = useState<Member | null>(null)
  const [deleteIds, setDeleteIds] = useState<string[]>([])
  const [moveIds, setMoveIds] = useState<string[]>([])
  const [bulkImageOpen, setBulkImageOpen] = useState(false)
  const [submitOpen, setSubmitOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Lock state — submitted folders are read-only for non-owners
  const isLocked = !!folder?.submittedAt
  const canEdit = !isLocked || isOwner

  // Load folder info
  useEffect(() => {
    if (!workspaceId || !folderId) return
    getFolder(workspaceId, folderId).then((f) => {
      setFolder(f)
      if (!f) setLoading(false)
    })
  }, [workspaceId, folderId])

  // Subscribe to members in this folder
  useEffect(() => {
    if (!workspaceId || !folderId) return
    setLoading(true)
    const unsub = subscribeMembers(
      workspaceId,
      folderId,
      (m) => {
        setMembers(m)
        setLoading(false)
      },
      () => setLoading(false),
    )
    return unsub
  }, [workspaceId, folderId])

  // Subscribe to all folders (for subfolder panel + move dialog)
  useEffect(() => {
    if (!workspaceId) return
    const unsub = subscribeFolders(workspaceId, setAllFolders)
    return unsub
  }, [workspaceId])

  // Subfolders of this folder
  const subfolders = useMemo(
    () => allFolders.filter((f) => f.parentFolderId === folderId),
    [allFolders, folderId],
  )

  // Filter members by search + selected subfolder
  const filtered = useMemo(() => {
    let list = members
    if (selectedSubfolder === '__root__') {
      list = list.filter((m) => !m.subfolderId)
    } else if (selectedSubfolder) {
      list = list.filter((m) => m.subfolderId === selectedSubfolder)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (m) =>
          m.firstName.toLowerCase().includes(q) ||
          m.lastName.toLowerCase().includes(q) ||
          m.employeeId.toLowerCase().includes(q) ||
          m.department.toLowerCase().includes(q),
      )
    }
    return list
  }, [members, search, selectedSubfolder])

  const handleExport = () => {
    exportMembersToXlsx(filtered, folder?.name ?? 'members')
  }

  const handleDownloadExcel = () => {
    const cols = folder?.tableColumns
    if (!cols || cols.length === 0) {
      toast.error('No table columns', {
        description: 'This folder has no table defined yet.',
      })
      return
    }
    // Apply subfolder filter so we only export the current view
    let downloadMembers = members
    if (selectedSubfolder === '__root__') {
      downloadMembers = members.filter((m) => !m.subfolderId)
    } else if (selectedSubfolder) {
      downloadMembers = members.filter((m) => m.subfolderId === selectedSubfolder)
    }
    if (downloadMembers.length === 0) {
      toast.info('No data to download', {
        description: 'This folder has no members yet.',
      })
      return
    }
    exportFolderDataToXlsx(downloadMembers, cols, folder?.name ?? 'members')
  }

  const handleBulkDelete = () => {
    if (selectedIds.size > 0) {
      setDeleteIds(Array.from(selectedIds))
    }
  }

  const handleBulkMove = () => {
    if (selectedIds.size > 0) {
      setMoveIds(Array.from(selectedIds))
    }
  }

  const handleSubmitFolder = async () => {
    try {
      setSubmitting(true)
      await submitFolder(workspaceId, folderId)
      toast.success('College submitted successfully', {
        description: 'This folder is now locked and read-only.',
      })
      // Re-fetch folder to update local state
      const updated = await getFolder(workspaceId, folderId)
      if (updated) setFolder(updated)
    } catch {
      toast.error('Failed to submit folder')
    } finally {
      setSubmitting(false)
      setSubmitOpen(false)
    }
  }

  // Portal access control: check the folder belongs to this portal user
  const isSubfolderOfPortal = useMemo(() => {
    if (!isPortalUser || !portalFolderId) return true // not a portal user, no restriction
    if (folderId === portalFolderId) return true // this IS the portal folder
    // Check if the current folder is a subfolder of the portal folder
    return allFolders.some(
      (f) => f.id === folderId && f.parentFolderId === portalFolderId,
    )
  }, [isPortalUser, portalFolderId, folderId, allFolders])

  if (isPortalUser && !loading && !isSubfolderOfPortal) {
    return (
      <>
        <PageHeader title="No Permission" />
        <Empty className="flex-1 border border-dashed">
          <EmptyHeader>
            <EmptyTitle>No Permission</EmptyTitle>
            <EmptyDescription>
              You do not have access to this folder. Your portal is
              restricted to your assigned College only.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" nativeButton={false} render={<Link href="/data-upload" />}>
              <ArrowLeftIcon data-icon="inline-start" />
              Back to your College
            </Button>
          </EmptyContent>
        </Empty>
      </>
    )
  }

  if (!loading && !folder) {
    return (
      <>
        <PageHeader title="Folder not found" />
        <Empty className="flex-1 border border-dashed">
          <EmptyHeader>
            <EmptyTitle>This folder does not exist</EmptyTitle>
            <EmptyDescription>
              It may have been deleted or the link is incorrect.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" nativeButton={false} render={<Link href="/data-upload" />}>
              <ArrowLeftIcon data-icon="inline-start" />
              Back to folders
            </Button>
          </EmptyContent>
        </Empty>
      </>
    )
  }

  return (
    <>
      {/* Top controls */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" nativeButton={false} render={<Link href="/data-upload" />}>
            <ArrowLeftIcon data-icon="inline-start" />
            Back
          </Button>
          <h1 className="text-xl font-semibold tracking-tight">
            {folder?.name ?? <Skeleton className="inline-block h-5 w-40" />}
          </h1>
          {isLocked && (
            <Badge variant="secondary" className="gap-1">
              <LockIcon className="size-3" />
              Submitted
            </Badge>
          )}
          {!isLocked && folder && (
            <Button
              variant="default"
              size="sm"
              onClick={() => setSubmitOpen(true)}
            >
              <SendIcon data-icon="inline-start" />
              Submit
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-xs flex-1">
            <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search members…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setAddOpen(true)} disabled={!canEdit}>
              <PlusIcon data-icon="inline-start" />
              Add Member
            </Button>
            <Button variant="secondary" onClick={() => setQuickAddOpen(true)} disabled={!canEdit}>
              <ZapIcon data-icon="inline-start" />
              Quick Add
            </Button>
            {isOwner && (
              <Button variant="outline" onClick={handleDownloadExcel}>
                <DownloadIcon data-icon="inline-start" />
                Download Excel
              </Button>
            )}
          </div>
        </div>

        {/* Secondary toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b pb-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
            disabled={!canEdit}
          >
            <UploadIcon data-icon="inline-start" />
            Import
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCreateTableOpen(true)}
            disabled={!canEdit || (!!selectedSubfolder && selectedSubfolder !== '__root__')}
            title={selectedSubfolder && selectedSubfolder !== '__root__' ? 'Subfolders inherit the main folder\'s table' : undefined}
          >
            <TableIcon data-icon="inline-start" />
            {folder?.tableColumns?.length ? 'Edit Table' : 'Create Table'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <DownloadIcon data-icon="inline-start" />
            Export
          </Button>
          <Button variant="outline" size="sm" disabled title="Coming in a later phase">
            <ImageIcon data-icon="inline-start" />
            Export Images
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkImageOpen(true)}
            disabled={
              !canEdit ||
              !selectedSubfolder ||
              selectedSubfolder === '__root__' ||
              !folder?.tableColumnTypes ||
              Object.values(folder.tableColumnTypes).every((t) => t !== 'image')
            }
            title={
              !selectedSubfolder || selectedSubfolder === '__root__'
                ? 'Select a subfolder first'
                : !folder?.tableColumnTypes || Object.values(folder.tableColumnTypes).every((t) => t !== 'image')
                  ? 'No image columns defined'
                  : 'Upload images in bulk by filename'
            }
          >
            <LayersIcon data-icon="inline-start" />
            Bulk Images
          </Button>
          <Button variant="outline" size="sm" disabled title="Coming in a later phase">
            <FileSpreadsheetIcon data-icon="inline-start" />
            Template
          </Button>

          {selectedIds.size > 0 && canEdit && (
            <>
              <div className="h-5 w-px bg-border" />
              <span className="text-xs text-muted-foreground">
                {selectedIds.size} selected
              </span>
              <Button variant="outline" size="sm" onClick={handleBulkMove}>
                Move
              </Button>
              <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 flex-col gap-6 lg:flex-row">
        {/* Subfolder panel */}
        <SubfolderPanel
          workspaceId={workspaceId}
          folderId={folderId}
          parentFolder={folder}
          subfolders={subfolders}
          members={members}
          selectedSubfolder={selectedSubfolder}
          onSelectSubfolder={setSelectedSubfolder}
          isLocked={!canEdit}
        />

        {/* Member table */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : filtered.length > 0 ? (
            <MemberTable
              members={filtered}
              subfolders={subfolders}
              tableColumns={folder?.tableColumns}
              tableColumnTypes={folder?.tableColumnTypes}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              onEdit={(m) => canEdit ? setEditMember(m) : undefined}
              onDelete={(id) => canEdit ? setDeleteIds([id]) : undefined}
              onMove={(id) => canEdit ? setMoveIds([id]) : undefined}
            />
          ) : (
            <Empty className="flex-1 border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchIcon />
                </EmptyMedia>
                <EmptyTitle>
                  {search.trim()
                    ? `No members match "${search}"`
                    : selectedSubfolder
                      ? 'No members in this subfolder'
                      : 'No members yet'}
                </EmptyTitle>
                <EmptyDescription>
                  {search.trim()
                    ? 'Try a different search term.'
                    : 'Add your first member or import from a file.'}
                </EmptyDescription>
              </EmptyHeader>
              {!search.trim() && canEdit && (
                <EmptyContent>
                  <Button onClick={() => setAddOpen(true)}>
                    <PlusIcon data-icon="inline-start" />
                    Add Member
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <AddMemberDialog
        open={addOpen || editMember !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAddOpen(false)
            setEditMember(null)
          }
        }}
        workspaceId={workspaceId}
        folderId={folderId}
        subfolders={subfolders}
        member={editMember}
        tableColumns={folder?.tableColumns}
        tableColumnTypes={folder?.tableColumnTypes}
      />

      <QuickAddDialog
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
        workspaceId={workspaceId}
        folderId={folderId}
      />

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        workspaceId={workspaceId}
        folderId={folderId}
        subfolderId={selectedSubfolder && selectedSubfolder !== '__root__' ? selectedSubfolder : null}
        existingColumns={folder?.tableColumns}
      />

      <CreateTableDialog
        open={createTableOpen}
        onOpenChange={setCreateTableOpen}
        workspaceId={workspaceId}
        folderId={folderId}
        existingColumns={folder?.tableColumns}
        existingColumnTypes={folder?.tableColumnTypes}
      />

      {deleteIds.length > 0 && (
        <DeleteMemberDialog
          open
          onOpenChange={(open) => {
            if (!open) setDeleteIds([])
          }}
          workspaceId={workspaceId}
          memberIds={deleteIds}
          onDeleted={() => {
            setSelectedIds((prev) => {
              const next = new Set(prev)
              deleteIds.forEach((id) => next.delete(id))
              return next
            })
            setDeleteIds([])
          }}
        />
      )}

      {moveIds.length > 0 && (
        <MoveMemberDialog
          open
          onOpenChange={(open) => {
            if (!open) setMoveIds([])
          }}
          workspaceId={workspaceId}
          memberIds={moveIds}
          folders={allFolders.filter((f) => f.parentFolderId === null)}
          subfolders={allFolders.filter((f) => f.parentFolderId !== null)}
          onMoved={() => {
            setSelectedIds(new Set())
            setMoveIds([])
          }}
        />
      )}

      {/* Bulk Image Upload */}
      <BulkImageDialog
        open={bulkImageOpen}
        onOpenChange={setBulkImageOpen}
        workspaceId={workspaceId}
        members={filtered}
        imageColumns={
          folder?.tableColumns?.filter(
            (col) => folder.tableColumnTypes?.[col] === 'image',
          ) ?? []
        }
        subfolderName={
          subfolders.find((sf) => sf.id === selectedSubfolder)?.name ?? 'Root'
        }
      />

      {/* Submit / Lock confirmation */}
      <AlertDialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-primary/10 text-primary">
              <SendIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>Submit College Data?</AlertDialogTitle>
            <AlertDialogDescription>
              After you confirm, this folder and its data will no longer be
              editable. Please make sure all student data is complete before
              continuing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmitFolder} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
