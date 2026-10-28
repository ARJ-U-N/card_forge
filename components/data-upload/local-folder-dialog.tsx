'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  FolderOpenIcon,
  HardDriveIcon,
  ImageIcon,
  Loader2Icon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
  UserIcon,
  UsersIcon,
  XCircleIcon,
  FileQuestionIcon,
  LinkIcon,
  HashIcon,
  TypeIcon,
  ArrowLeftIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { LocalFolderMapping, PhotoAssignment } from '@/lib/local-photos/local-photo-db'
import {
  saveFolderMapping,
  getMappingsForSubfolder,
  removeFolderMapping,
  savePhotoAssignments,
  getPhotoAssignments,
  clearPhotoAssignments,
} from '@/lib/local-photos/local-photo-db'
import type {
  MappingPermissionStatus,
  DirectoryEnumerationResult,
} from '@/lib/local-photos/local-photo-service'
import {
  isFileSystemAccessSupported,
  selectDirectory,
  checkPermission,
  requestPermission,
  enumerateImageFiles,
  getFilePreviewUrl,
  revokePreviewUrl,
} from '@/lib/local-photos/local-photo-service'
import type { Member } from '@/lib/models/types'
import type { MatchResult, PhotoMatch } from '@/lib/local-photos/local-photo-matcher'
import {
  matchPhotosToMembers,
  matchLegacyByDriveMetadata,
  extractDriveFileId,
} from '@/lib/local-photos/local-photo-matcher'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ColumnMappingState {
  mapping: LocalFolderMapping | null
  status: MappingPermissionStatus | null
  enumeration: DirectoryEnumerationResult | null
  loading: boolean
  /** Number of persisted photo assignments for this column. */
  assignmentCount: number
}

/** Which view the dialog is showing. */
type DialogView = 'columns' | 'review'

interface ReviewState {
  /** Which image column is being reviewed */
  imageColumn: string
  /** Name column used for matching */
  nameColumnKey: string | undefined
  /** The match result from the engine */
  result: MatchResult
  /** The directory handle (for preview thumbnails) */
  dirHandle: FileSystemDirectoryHandle
  /** Preview blob URLs keyed by filename. Loaded lazily. */
  previewUrls: Record<string, string>
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Root College folder Firestore ID */
  folderId: string
  /** Class subfolder Firestore ID */
  subfolderId: string
  /** Human-readable subfolder/class name */
  subfolderName: string
  /** Image column names from the folder's tableColumnTypes */
  imageColumns: string[]
  /** Members for this class (filtered by subfolderId). Required for matching. */
  members: Member[]
  /** All text column names from the folder's tableColumns (for name-column selection). */
  tableColumns?: string[]
  /** The column key already designated as table name (default for matching). */
  tableNameColumn?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LocalFolderDialog({
  open,
  onOpenChange,
  folderId,
  subfolderId,
  subfolderName,
  imageColumns,
  members,
  tableColumns,
  tableNameColumn,
}: Props) {
  const [columnStates, setColumnStates] = useState<
    Record<string, ColumnMappingState>
  >({})
  const [supported, setSupported] = useState(true)
  const [initialLoading, setInitialLoading] = useState(false)

  // View management
  const [view, setView] = useState<DialogView>('columns')
  const [reviewState, setReviewState] = useState<ReviewState | null>(null)
  const [scanning, setScanning] = useState(false)
  const [confirming, setConfirming] = useState(false)

  // Keep a ref to imageColumns so the load effect doesn't re-trigger
  // on every render due to array reference instability from the parent.
  const imageColumnsRef = useRef(imageColumns)
  imageColumnsRef.current = imageColumns

  // -----------------------------------------------------------------------
  // Load mappings when dialog opens
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!open) return

    const isSupported = isFileSystemAccessSupported()
    setSupported(isSupported)
    if (!isSupported) return

    let cancelled = false
    const cols = imageColumnsRef.current

    async function load() {
      setInitialLoading(true)

      try {
        const mappings = await getMappingsForSubfolder(folderId, subfolderId)
        if (cancelled) return

        const byCol = new Map(
          mappings.map((m) => [m.imageColumnName, m] as const),
        )

        // Initialize state for every image column
        const states: Record<string, ColumnMappingState> = {}
        for (const col of cols) {
          const mapping = byCol.get(col) ?? null
          states[col] = {
            mapping,
            status: null,
            enumeration: null,
            loading: !!mapping,
            assignmentCount: 0,
          }
        }
        setColumnStates(states)

        // Check permissions + enumerate for mapped columns (in parallel)
        // Also load assignment counts
        await Promise.all(
          cols.map(async (col) => {
            const mapping = byCol.get(col)

            // Load assignment count regardless of mapping status
            let assignmentCount = 0
            try {
              const assignments = await getPhotoAssignments(
                folderId,
                subfolderId,
                col,
              )
              assignmentCount = assignments.length
            } catch {
              // Non-fatal
            }

            if (!mapping || cancelled) {
              if (!cancelled) {
                setColumnStates((prev) => ({
                  ...prev,
                  [col]: {
                    ...(prev[col] ?? emptyState()),
                    assignmentCount,
                    loading: false,
                  },
                }))
              }
              return
            }

            try {
              const status = await checkPermission(mapping.directoryHandle)
              let enumResult: DirectoryEnumerationResult | null = null
              if (status === 'available') {
                enumResult = await enumerateImageFiles(
                  mapping.directoryHandle,
                )
              }
              if (!cancelled) {
                setColumnStates((prev) => ({
                  ...prev,
                  [col]: {
                    ...prev[col],
                    status,
                    enumeration: enumResult,
                    assignmentCount,
                    loading: false,
                  },
                }))
              }
            } catch {
              if (!cancelled) {
                setColumnStates((prev) => ({
                  ...prev,
                  [col]: {
                    ...prev[col],
                    status: 'unavailable',
                    assignmentCount,
                    loading: false,
                  },
                }))
              }
            }
          }),
        )
      } catch (err) {
        if (cancelled) return
        console.error('Failed to load folder mappings:', err)
        toast.error('Failed to load local folder mappings.')

        const states: Record<string, ColumnMappingState> = {}
        for (const col of cols) {
          states[col] = {
            mapping: null,
            status: null,
            enumeration: null,
            loading: false,
            assignmentCount: 0,
          }
        }
        setColumnStates(states)
      } finally {
        if (!cancelled) setInitialLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [open, folderId, subfolderId])

  // -----------------------------------------------------------------------
  // Cleanup preview URLs on unmount or view change
  // -----------------------------------------------------------------------

  useEffect(() => {
    return () => {
      if (reviewState) {
        for (const url of Object.values(reviewState.previewUrls)) {
          revokePreviewUrl(url)
        }
      }
    }
  }, [reviewState])

  // -----------------------------------------------------------------------
  // Action: Map or remap a folder for an image column
  // -----------------------------------------------------------------------

  const handleMapFolder = useCallback(
    async (col: string) => {
      setColumnStates((prev) => ({
        ...prev,
        [col]: { ...(prev[col] ?? emptyState()), loading: true },
      }))

      try {
        const handle = await selectDirectory()
        if (!handle) {
          // User cancelled — restore previous state without disturbing it
          setColumnStates((prev) => ({
            ...prev,
            [col]: { ...(prev[col] ?? emptyState()), loading: false },
          }))
          return
        }

        const mapping = await saveFolderMapping({
          folderId,
          subfolderId,
          imageColumnName: col,
          directoryHandle: handle,
          directoryName: handle.name,
        })

        // Permission is implicitly granted right after selection
        let enumResult: DirectoryEnumerationResult | null = null
        try {
          enumResult = await enumerateImageFiles(handle)
        } catch {
          // Enumeration failure is not fatal — we still have the mapping
        }

        setColumnStates((prev) => ({
          ...prev,
          [col]: {
            ...prev[col],
            mapping,
            status: 'available',
            enumeration: enumResult,
            loading: false,
          },
        }))

        toast.success(`Folder mapped for "${col}"`, {
          description: `"${handle.name}" is now linked to this image column.`,
        })
      } catch (err) {
        console.error(`Failed to map folder for ${col}:`, err)
        setColumnStates((prev) => ({
          ...prev,
          [col]: { ...(prev[col] ?? emptyState()), loading: false },
        }))
        toast.error(
          err instanceof Error
            ? err.message
            : `Failed to map folder for "${col}".`,
        )
      }
    },
    [folderId, subfolderId],
  )

  // -----------------------------------------------------------------------
  // Action: Reconnect (request permission again)
  // -----------------------------------------------------------------------

  const handleReconnect = useCallback(
    async (col: string) => {
      const state = columnStates[col]
      if (!state?.mapping?.directoryHandle) return

      setColumnStates((prev) => ({
        ...prev,
        [col]: { ...prev[col], loading: true },
      }))

      try {
        const status = await requestPermission(state.mapping.directoryHandle)
        let enumResult: DirectoryEnumerationResult | null = null

        if (status === 'available') {
          try {
            enumResult = await enumerateImageFiles(
              state.mapping.directoryHandle,
            )
          } catch {
            // Non-fatal
          }
        }

        setColumnStates((prev) => ({
          ...prev,
          [col]: {
            ...prev[col],
            status,
            enumeration: enumResult,
            loading: false,
          },
        }))

        if (status === 'available') {
          toast.success(`Reconnected folder for "${col}".`)
        } else if (status === 'unavailable') {
          toast.error(
            `Permission denied for "${col}". Try remapping the folder.`,
          )
        }
      } catch (err) {
        console.error(`Failed to reconnect folder for ${col}:`, err)
        setColumnStates((prev) => ({
          ...prev,
          [col]: {
            ...prev[col],
            status: 'unavailable',
            loading: false,
          },
        }))
        toast.error(`Failed to reconnect folder for "${col}".`)
      }
    },
    [columnStates],
  )

  // -----------------------------------------------------------------------
  // Action: Remove a mapping
  // -----------------------------------------------------------------------

  const handleRemove = useCallback(
    async (col: string) => {
      try {
        await removeFolderMapping(folderId, subfolderId, col)

        setColumnStates((prev) => ({
          ...prev,
          [col]: {
            mapping: null,
            status: null,
            enumeration: null,
            loading: false,
            assignmentCount: prev[col]?.assignmentCount ?? 0,
          },
        }))

        toast.success(`Mapping removed for "${col}".`, {
          description:
            'No files were deleted from your computer or Google Drive.',
        })
      } catch (err) {
        console.error(`Failed to remove mapping for ${col}:`, err)
        toast.error(`Failed to remove mapping for "${col}".`)
      }
    },
    [folderId, subfolderId],
  )

  // -----------------------------------------------------------------------
  // Action: Scan & Match
  // -----------------------------------------------------------------------

  const handleScanAndMatch = useCallback(
    async (col: string) => {
      const state = columnStates[col]
      if (!state?.mapping?.directoryHandle || state.status !== 'available') {
        toast.error('Folder is not accessible. Reconnect or remap first.')
        return
      }
      if (members.length === 0) {
        toast.error('No members in this class to match against.')
        return
      }

      setScanning(true)

      try {
        // Enumerate files
        const enumResult = await enumerateImageFiles(
          state.mapping.directoryHandle,
        )

        if (enumResult.imageCount === 0) {
          toast.error('No image files found in the mapped folder.', {
            description: `Folder "${state.mapping.directoryName}" contains no recognized image files.`,
          })
          setScanning(false)
          return
        }

        // Run the matcher
        const result = matchPhotosToMembers(
          enumResult.imageFileNames,
          members,
          tableNameColumn,
        )

        setReviewState({
          imageColumn: col,
          nameColumnKey: tableNameColumn,
          result,
          dirHandle: state.mapping.directoryHandle,
          previewUrls: {},
        })
        setView('review')
      } catch (err) {
        console.error('Scan & Match failed:', err)
        toast.error(
          err instanceof Error ? err.message : 'Failed to scan and match photos.',
        )
      } finally {
        setScanning(false)
      }
    },
    [columnStates, members, tableNameColumn],
  )

  // -----------------------------------------------------------------------
  // Action: Clear existing assignments
  // -----------------------------------------------------------------------

  const handleClearAssignments = useCallback(
    async (col: string) => {
      try {
        await clearPhotoAssignments(folderId, subfolderId, col)
        setColumnStates((prev) => ({
          ...prev,
          [col]: {
            ...prev[col],
            assignmentCount: 0,
          },
        }))
        toast.success(`Assignments cleared for "${col}".`, {
          description: 'No files were deleted.',
        })
      } catch (err) {
        console.error(`Failed to clear assignments for ${col}:`, err)
        toast.error(`Failed to clear assignments for "${col}".`)
      }
    },
    [folderId, subfolderId],
  )

  // -----------------------------------------------------------------------
  // Action: Confirm assignments from review
  // -----------------------------------------------------------------------

  const handleConfirmAssignments = useCallback(async () => {
    if (!reviewState) return

    setConfirming(true)
    try {
      const assignments = reviewState.result.matches.map((m) => ({
        memberId: m.memberId,
        filename: m.filename,
        matchMethod: m.method,
      }))

      await savePhotoAssignments(
        folderId,
        subfolderId,
        reviewState.imageColumn,
        assignments,
      )

      // Update assignment count in column state
      setColumnStates((prev) => ({
        ...prev,
        [reviewState.imageColumn]: {
          ...prev[reviewState.imageColumn],
          assignmentCount: assignments.length,
        },
      }))

      toast.success(
        `${assignments.length} photo assignment${assignments.length !== 1 ? 's' : ''} saved for "${reviewState.imageColumn}".`,
      )

      // Return to column list
      handleBackToColumns()
    } catch (err) {
      console.error('Failed to save assignments:', err)
      toast.error(
        err instanceof Error
          ? err.message
          : 'Failed to save photo assignments.',
      )
    } finally {
      setConfirming(false)
    }
  }, [reviewState, folderId, subfolderId])

  // -----------------------------------------------------------------------
  // Action: Match legacy parent photos via Drive metadata
  // -----------------------------------------------------------------------

  const [legacyMatching, setLegacyMatching] = useState(false)

  const handleMatchLegacy = useCallback(async () => {
    if (!reviewState) return
    const { result, imageColumn } = reviewState

    // Only process members that weren't matched by ID or name
    const unmatchedMemberIds = result.missingMembers.map((m) => m.memberId)
    if (unmatchedMemberIds.length === 0) {
      toast.info('All members already have matches.')
      return
    }

    // Check if any unmatched members have Drive image URLs
    const membersWithDriveUrls = unmatchedMemberIds.filter((id) => {
      const m = members.find((mem) => mem.id === id)
      if (!m) return false
      let imageUrl = ''
      switch (imageColumn) {
        case 'profileImage': imageUrl = m.profileImage ?? ''; break
        case 'signature': imageUrl = m.signature ?? ''; break
        case 'divisionLogo': imageUrl = m.divisionLogo ?? ''; break
        case 'fingerprint': imageUrl = m.fingerprint ?? ''; break
        default: imageUrl = m.customFields?.[imageColumn] ?? ''; break
      }
      return !!extractDriveFileId(imageUrl)
    })

    if (membersWithDriveUrls.length === 0) {
      toast.info('No legacy Drive photos found for unmatched members.')
      return
    }

    setLegacyMatching(true)
    try {
      // Enumerate current local filenames
      const enumResult = await enumerateImageFiles(reviewState.dirHandle)
      const alreadyMatched = new Set(result.matches.map((m) => m.filename))

      const legacyResult = await matchLegacyByDriveMetadata(
        unmatchedMemberIds,
        members,
        imageColumn,
        enumResult.imageFileNames,
        alreadyMatched,
        reviewState.nameColumnKey,
      )

      if (legacyResult.matches.length === 0) {
        const reasons: string[] = []
        if (legacyResult.lookupFailed.length > 0) {
          reasons.push(`${legacyResult.lookupFailed.length} Drive lookup(s) failed`)
        }
        if (legacyResult.noLocalMatch.length > 0) {
          reasons.push(`${legacyResult.noLocalMatch.length} Drive file(s) not found locally`)
        }
        toast.info(
          'No legacy matches found.',
          { description: reasons.join('. ') || 'No Drive files matched local files.' },
        )
        return
      }

      // Merge legacy matches into the review state
      const newMatches: PhotoMatch[] = legacyResult.matches.map((lm) => ({
        filename: lm.localFilename,
        memberId: lm.memberId,
        method: 'drive-filename' as const,
      }))

      const matchedMemberIdsFromLegacy = new Set(
        legacyResult.matches.map((lm) => lm.memberId),
      )

      setReviewState((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          result: {
            ...prev.result,
            matches: [...prev.result.matches, ...newMatches],
            missingMembers: prev.result.missingMembers.filter(
              (m) => !matchedMemberIdsFromLegacy.has(m.memberId),
            ),
            unmatchedFiles: prev.result.unmatchedFiles.filter(
              (f) => !legacyResult.matches.some((lm) => lm.localFilename === f),
            ),
          },
        }
      })

      toast.success(
        `${legacyResult.matches.length} legacy photo${legacyResult.matches.length !== 1 ? 's' : ''} matched via Drive metadata.`,
        {
          description: legacyResult.matches
            .map((lm) => `${lm.driveFilename} → ${lm.localFilename}`)
            .slice(0, 3)
            .join('\n') +
            (legacyResult.matches.length > 3 ? `\n+${legacyResult.matches.length - 3} more` : ''),
        },
      )
    } catch (err) {
      console.error('Legacy matching failed:', err)
      toast.error('Failed to match legacy photos via Drive metadata.')
    } finally {
      setLegacyMatching(false)
    }
  }, [reviewState, members])

  // -----------------------------------------------------------------------
  // Navigation helpers
  // -----------------------------------------------------------------------

  const handleBackToColumns = useCallback(() => {
    // Revoke preview URLs
    if (reviewState) {
      for (const url of Object.values(reviewState.previewUrls)) {
        revokePreviewUrl(url)
      }
    }
    setReviewState(null)
    setView('columns')
  }, [reviewState])

  // -----------------------------------------------------------------------
  // Dialog open/close
  // -----------------------------------------------------------------------

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        // Cleanup preview URLs
        if (reviewState) {
          for (const url of Object.values(reviewState.previewUrls)) {
            revokePreviewUrl(url)
          }
        }
        // Reset transient state on close; IndexedDB retains the mappings
        setColumnStates({})
        setInitialLoading(false)
        setView('columns')
        setReviewState(null)
        setScanning(false)
        setConfirming(false)
      }
      onOpenChange(next)
    },
    [onOpenChange, reviewState],
  )

  // -----------------------------------------------------------------------
  // Lazy thumbnail loader
  // -----------------------------------------------------------------------

  const loadPreviewUrl = useCallback(
    async (filename: string) => {
      if (!reviewState) return
      if (reviewState.previewUrls[filename]) return // Already loaded

      try {
        const url = await getFilePreviewUrl(reviewState.dirHandle, filename)
        setReviewState((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            previewUrls: { ...prev.previewUrls, [filename]: url },
          }
        })
      } catch {
        // Preview failed — non-fatal
      }
    },
    [reviewState],
  )

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        {view === 'columns' && (
          <ColumnsView
            supported={supported}
            initialLoading={initialLoading}
            imageColumns={imageColumns}
            columnStates={columnStates}
            subfolderName={subfolderName}
            scanning={scanning}
            onMapFolder={handleMapFolder}
            onReconnect={handleReconnect}
            onRemove={handleRemove}
            onScanAndMatch={handleScanAndMatch}
            onClearAssignments={handleClearAssignments}
            onClose={() => handleOpenChange(false)}
          />
        )}
        {view === 'review' && reviewState && (
          <ReviewView
            reviewState={reviewState}
            members={members}
            nameColumnKey={reviewState.nameColumnKey}
            confirming={confirming}
            onConfirm={handleConfirmAssignments}
            onBack={handleBackToColumns}
            onLoadPreview={loadPreviewUrl}
            onMatchLegacy={handleMatchLegacy}
            legacyMatching={legacyMatching}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Columns View (the original mapping list + Scan & Match button)
// ---------------------------------------------------------------------------

function ColumnsView({
  supported,
  initialLoading,
  imageColumns,
  columnStates,
  subfolderName,
  scanning,
  onMapFolder,
  onReconnect,
  onRemove,
  onScanAndMatch,
  onClearAssignments,
  onClose,
}: {
  supported: boolean
  initialLoading: boolean
  imageColumns: string[]
  columnStates: Record<string, ColumnMappingState>
  subfolderName: string
  scanning: boolean
  onMapFolder: (col: string) => void
  onReconnect: (col: string) => void
  onRemove: (col: string) => void
  onScanAndMatch: (col: string) => void
  onClearAssignments: (col: string) => void
  onClose: () => void
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <HardDriveIcon className="size-4" />
          Local Photo Folders
        </DialogTitle>
        <DialogDescription>
          Map local directories containing photos for{' '}
          <strong>{subfolderName}</strong>. Each image column can be linked
          to a separate folder on your computer.
        </DialogDescription>
      </DialogHeader>

      {/* Unsupported browser warning */}
      {!supported && (
        <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <span className="flex items-center gap-1.5 font-medium text-destructive">
            <AlertTriangleIcon className="size-4" />
            Browser Not Supported
          </span>
          <p className="text-muted-foreground">
            Your browser does not support the File System Access API required
            for local folder mapping. Please use{' '}
            <strong>Google Chrome</strong> or{' '}
            <strong>Microsoft Edge</strong> (version 86 or later).
          </p>
        </div>
      )}

      {/* Loading */}
      {supported && initialLoading && (
        <div className="flex items-center justify-center py-6">
          <Spinner className="size-5" />
        </div>
      )}

      {/* Scanning overlay */}
      {scanning && (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          Scanning and matching photos…
        </div>
      )}

      {/* No image columns */}
      {supported && !initialLoading && !scanning && imageColumns.length === 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No image columns defined. Edit the table to add image columns
          first.
        </p>
      )}

      {/* Image column mapping list */}
      {supported && !initialLoading && !scanning && imageColumns.length > 0 && (
        <div className="flex flex-col gap-4">
          {imageColumns.map((col, idx) => {
            const state = columnStates[col] ?? emptyState()

            return (
              <div key={col}>
                {idx > 0 && <Separator className="mb-4" />}

                <div className="flex flex-col gap-2">
                  {/* Column header + status */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="size-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{col}</span>
                    </div>
                    {state.loading ? (
                      <Spinner className="size-4" />
                    ) : (
                      <StatusBadge status={state.status} />
                    )}
                  </div>

                  {/* Mapped directory info */}
                  {state.mapping && (
                    <div className="flex flex-col gap-1 rounded-lg border bg-muted/50 p-2.5 text-xs">
                      <div className="flex items-center gap-1.5">
                        <FolderOpenIcon className="size-3.5 text-muted-foreground" />
                        <span className="font-medium">
                          {state.mapping.directoryName}
                        </span>
                      </div>
                      {state.enumeration && (
                        <span className="text-muted-foreground">
                          {state.enumeration.imageCount} image
                          {state.enumeration.imageCount !== 1 ? 's' : ''}{' '}
                          found
                          {state.enumeration.totalEntries >
                            state.enumeration.imageCount && (
                            <>
                              {' '}
                              ({state.enumeration.totalEntries} total
                              entries)
                            </>
                          )}
                        </span>
                      )}
                      {state.assignmentCount > 0 && (
                        <span className="flex items-center gap-1 text-emerald-600">
                          <LinkIcon className="size-3" />
                          {state.assignmentCount} photo assignment
                          {state.assignmentCount !== 1 ? 's' : ''} saved
                        </span>
                      )}
                      {state.status === 'unavailable' && (
                        <span className="text-destructive">
                          This directory is no longer accessible. Try
                          remapping it.
                        </span>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2">
                    {!state.mapping ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onMapFolder(col)}
                        disabled={state.loading || !supported}
                      >
                        <FolderOpenIcon data-icon="inline-start" />
                        Map Folder
                      </Button>
                    ) : (
                      <>
                        {state.status === 'permission-needed' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onReconnect(col)}
                            disabled={state.loading}
                          >
                            <RefreshCwIcon data-icon="inline-start" />
                            Reconnect
                          </Button>
                        )}
                        {state.status === 'available' && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => onScanAndMatch(col)}
                            disabled={state.loading}
                          >
                            <SearchIcon data-icon="inline-start" />
                            Scan &amp; Match
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onMapFolder(col)}
                          disabled={state.loading}
                        >
                          <FolderOpenIcon data-icon="inline-start" />
                          Remap
                        </Button>
                        {state.assignmentCount > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onClearAssignments(col)}
                            disabled={state.loading}
                            className="text-amber-600 hover:text-amber-600"
                          >
                            <Trash2Icon data-icon="inline-start" />
                            Clear Assignments
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onRemove(col)}
                          disabled={state.loading}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2Icon data-icon="inline-start" />
                          Remove
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </>
  )
}

// ---------------------------------------------------------------------------
// Review View (match results + confirm)
// ---------------------------------------------------------------------------

function ReviewView({
  reviewState,
  members,
  nameColumnKey,
  confirming,
  onConfirm,
  onBack,
  onLoadPreview,
  onMatchLegacy,
  legacyMatching,
}: {
  reviewState: ReviewState
  members: Member[]
  nameColumnKey: string | undefined
  confirming: boolean
  onConfirm: () => void
  onBack: () => void
  onLoadPreview: (filename: string) => void
  onMatchLegacy: () => void
  legacyMatching: boolean
}) {
  const { result, previewUrls, imageColumn } = reviewState
  const memberById = new Map(members.map((m) => [m.id, m]))

  const getMemberName = (memberId: string): string => {
    const m = memberById.get(memberId)
    if (!m) return '(unknown)'
    if (nameColumnKey) {
      return m.customFields?.[nameColumnKey] || `${m.firstName} ${m.lastName}`.trim() || '(unnamed)'
    }
    return `${m.firstName} ${m.lastName}`.trim() || '(unnamed)'
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <SearchIcon className="size-4" />
          Match Review — {imageColumn}
        </DialogTitle>
        <DialogDescription>
          Review the proposed photo assignments below. Only confirmed matches
          will be saved. Ambiguous or unmatched files are shown for reference.
        </DialogDescription>
      </DialogHeader>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="default" className="gap-1 bg-emerald-600 hover:bg-emerald-600">
          <CheckCircle2Icon className="size-3" />
          {result.matches.length} matched
        </Badge>
        {result.ambiguous.length > 0 && (
          <Badge variant="secondary" className="gap-1 text-amber-600 border-amber-300">
            <AlertTriangleIcon className="size-3" />
            {result.ambiguous.length} ambiguous
          </Badge>
        )}
        {result.missingMembers.length > 0 && (
          <Badge variant="secondary" className="gap-1">
            <UserIcon className="size-3" />
            {result.missingMembers.length} missing photo
            {result.missingMembers.length !== 1 ? 's' : ''}
          </Badge>
        )}
        {result.unmatchedFiles.length > 0 && (
          <Badge variant="secondary" className="gap-1">
            <FileQuestionIcon className="size-3" />
            {result.unmatchedFiles.length} unmatched file
            {result.unmatchedFiles.length !== 1 ? 's' : ''}
          </Badge>
        )}
        {result.duplicateFiles.length > 0 && (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangleIcon className="size-3" />
            {result.duplicateFiles.length} duplicate
            {result.duplicateFiles.length !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      {/* Confirmed matches */}
      {result.matches.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <CheckCircle2Icon className="size-4 text-emerald-600" />
            Confirmed Matches ({result.matches.length})
          </h3>
          <div className="max-h-60 overflow-y-auto rounded-lg border">
            <div className="divide-y">
              {result.matches.map((match) => (
                <MatchRow
                  key={match.filename}
                  match={match}
                  memberName={getMemberName(match.memberId)}
                  previewUrl={previewUrls[match.filename]}
                  onLoadPreview={onLoadPreview}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Ambiguous matches */}
      {result.ambiguous.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold flex items-center gap-1.5 text-amber-600">
            <AlertTriangleIcon className="size-4" />
            Ambiguous ({result.ambiguous.length})
          </h3>
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
            <div className="divide-y divide-amber-200">
              {result.ambiguous.map((a, i) => (
                <div
                  key={`ambiguous-${i}`}
                  className="flex flex-col gap-1 px-3 py-2 text-xs"
                >
                  <span className="font-medium">{a.filename}</span>
                  <span className="text-muted-foreground">
                    {a.reason === 'duplicate-names'
                      ? `Multiple members share this name: ${a.candidateMemberIds.map(getMemberName).join(', ')}`
                      : `Multiple files match this member: ${getMemberName(a.candidateMemberIds[0])}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Missing members (no photo found) */}
      {result.missingMembers.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold flex items-center gap-1.5 text-muted-foreground">
            <UserIcon className="size-4" />
            Members Without Photos ({result.missingMembers.length})
          </h3>
          <div className="max-h-40 overflow-y-auto rounded-lg border bg-muted/30">
            <div className="divide-y">
              {result.missingMembers.map((m) => (
                <div
                  key={m.memberId}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs"
                >
                  <UsersIcon className="size-3 text-muted-foreground" />
                  <span>{m.memberName}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Legacy matching via Drive metadata */}
          <Button
            variant="outline"
            size="sm"
            onClick={onMatchLegacy}
            disabled={legacyMatching}
            className="self-start"
          >
            {legacyMatching ? (
              <Loader2Icon className="size-3.5 animate-spin mr-1.5" />
            ) : (
              <SearchIcon className="size-3.5 mr-1.5" />
            )}
            {legacyMatching ? 'Looking up Drive filenames…' : 'Match Legacy Photos via Drive'}
          </Button>
          <p className="text-[10px] text-muted-foreground">
            Looks up original Drive filenames for members with older timestamp-based photos
            and matches them to local files. No files are downloaded or modified.
          </p>
        </div>
      )}

      {/* Unmatched files */}
      {result.unmatchedFiles.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold flex items-center gap-1.5 text-muted-foreground">
            <FileQuestionIcon className="size-4" />
            Unmatched Files ({result.unmatchedFiles.length})
          </h3>
          <div className="max-h-40 overflow-y-auto rounded-lg border bg-muted/30">
            <div className="divide-y">
              {result.unmatchedFiles.map((f) => (
                <div
                  key={f}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs"
                >
                  <ImageIcon className="size-3 text-muted-foreground" />
                  <span className="truncate">{f}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* No matches at all */}
      {result.matches.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 p-4 text-center text-sm">
          <AlertTriangleIcon className="mx-auto mb-2 size-8 text-amber-500" />
          <p className="font-medium">No confirmed matches found.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Check that the filenames follow the expected naming convention
            or that member names match the file names.
          </p>
        </div>
      )}

      <DialogFooter className="flex-row gap-2 sm:justify-between">
        <Button variant="outline" onClick={onBack} disabled={confirming}>
          <ArrowLeftIcon data-icon="inline-start" />
          Back
        </Button>
        <Button
          onClick={onConfirm}
          disabled={confirming || result.matches.length === 0}
        >
          {confirming
            ? 'Saving…'
            : `Confirm ${result.matches.length} Assignment${result.matches.length !== 1 ? 's' : ''}`}
        </Button>
      </DialogFooter>
    </>
  )
}

// ---------------------------------------------------------------------------
// Match Row (individual match in the review list)
// ---------------------------------------------------------------------------

function MatchRow({
  match,
  memberName,
  previewUrl,
  onLoadPreview,
}: {
  match: PhotoMatch
  memberName: string
  previewUrl: string | undefined
  onLoadPreview: (filename: string) => void
}) {
  const imgRef = useRef<HTMLDivElement>(null)

  // Load preview when this row becomes visible
  useEffect(() => {
    if (previewUrl) return // Already loaded

    const el = imgRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onLoadPreview(match.filename)
          observer.disconnect()
        }
      },
      { threshold: 0.1 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [match.filename, previewUrl, onLoadPreview])

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      {/* Thumbnail */}
      <div
        ref={imgRef}
        className="size-10 shrink-0 overflow-hidden rounded border bg-muted"
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={match.filename}
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <ImageIcon className="size-4 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-0.5 min-w-0">
        <span className="text-sm font-medium truncate">{memberName}</span>
        <span className="text-xs text-muted-foreground truncate">
          {match.filename}
        </span>
      </div>

      {/* Match method badge */}
      <Badge
        variant="outline"
        className="shrink-0 gap-1 text-xs"
      >
        {match.method === 'member-id' ? (
          <>
            <HashIcon className="size-3" />
            ID
          </>
        ) : (
          <>
            <TypeIcon className="size-3" />
            Name
          </>
        )}
      </Badge>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyState(): ColumnMappingState {
  return { mapping: null, status: null, enumeration: null, loading: false, assignmentCount: 0 }
}

function StatusBadge({
  status,
}: {
  status: MappingPermissionStatus | null
}) {
  switch (status) {
    case 'available':
      return (
        <Badge
          variant="default"
          className="gap-1 bg-emerald-600 hover:bg-emerald-600"
        >
          <CheckCircle2Icon className="size-3" />
          Available
        </Badge>
      )
    case 'permission-needed':
      return (
        <Badge
          variant="secondary"
          className="gap-1 text-amber-600 border-amber-300"
        >
          <AlertTriangleIcon className="size-3" />
          Permission Needed
        </Badge>
      )
    case 'unavailable':
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircleIcon className="size-3" />
          Unavailable
        </Badge>
      )
    default:
      return null
  }
}
