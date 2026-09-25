'use client'

import { useRef, useState, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ImageIcon,
  LayersIcon,
  UploadIcon,
  XCircleIcon,
  XIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Separator } from '@/components/ui/separator'
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
import { updateMember } from '@/lib/firebase/member-repository'
import { storage } from '@/lib/storage'
import type { Member } from '@/lib/models/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedFile {
  file: File
  /** Numeric value extracted from the filename stem */
  number: number | null
  /** The original filename */
  filename: string
}

interface MatchResult {
  file: File
  rowNumber: number
  member: Member
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Known image fields that are stored directly on the Member document. */
const KNOWN_IMAGE_FIELDS = new Set(['profileImage', 'signature', 'fingerprint', 'divisionLogo'])

/** Upload subfolder for each known image field */
const IMAGE_UPLOAD_PATHS: Record<string, string> = {
  profileImage: 'profiles',
  signature: 'signatures',
  fingerprint: 'fingerprints',
  divisionLogo: 'logos',
}

/**
 * Extract the leading integer from a filename stem.
 * "1.jpg" → 1, "15.png" → 15, "hello.jpg" → null
 */
function extractNumber(filename: string): number | null {
  const stem = filename.replace(/\.[^.]+$/, '') // remove extension
  const n = Number(stem)
  if (Number.isInteger(n) && n > 0) return n
  return null
}

async function uploadImage(
  workspaceId: string,
  file: File,
  path: string,
): Promise<string> {
  try {
    const result = await storage.upload(workspaceId, file, `members/${path}`)
    return result.url
  } catch {
    // If Drive is not configured, fall back to base64
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.readAsDataURL(file)
    })
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  /** Members currently visible in the selected subfolder */
  members: Member[]
  /** Image column names from the folder's tableColumnTypes */
  imageColumns: string[]
  /** Display name of the currently selected subfolder */
  subfolderName: string
}

export function BulkImageDialog({
  open,
  onOpenChange,
  workspaceId,
  members,
  imageColumns,
  subfolderName,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  // State
  const [selectedColumn, setSelectedColumn] = useState<string>('')
  const [files, setFiles] = useState<ParsedFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [result, setResult] = useState<{
    uploaded: number
    failed: number
    unmatched: number
  } | null>(null)

  // Default to first image column when opening
  const effectiveColumn = selectedColumn || imageColumns[0] || ''

  // Build a map from rowNumber → member for the current subfolder members
  const rowMap = useMemo(() => {
    const map = new Map<number, Member>()
    for (const m of members) {
      if (typeof m.rowNumber === 'number') {
        map.set(m.rowNumber, m)
      }
    }
    return map
  }, [members])

  // Analyze selected files
  const analysis = useMemo(() => {
    const matched: MatchResult[] = []
    const unmatched: ParsedFile[] = []
    const duplicates: ParsedFile[] = []
    const seenNumbers = new Set<number>()

    for (const pf of files) {
      if (pf.number === null) {
        unmatched.push(pf)
        continue
      }
      if (seenNumbers.has(pf.number)) {
        duplicates.push(pf)
        continue
      }
      seenNumbers.add(pf.number)

      const member = rowMap.get(pf.number)
      if (member) {
        matched.push({ file: pf.file, rowNumber: pf.number, member })
      } else {
        unmatched.push(pf)
      }
    }

    return { matched, unmatched, duplicates }
  }, [files, rowMap])

  // File selection handler
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files
      if (!fileList) return
      const parsed: ParsedFile[] = Array.from(fileList).map((file) => ({
        file,
        number: extractNumber(file.name),
        filename: file.name,
      }))
      setFiles(parsed)
      setResult(null)
    },
    [],
  )

  // Upload handler
  const handleUpload = useCallback(async () => {
    if (!effectiveColumn || analysis.matched.length === 0) return

    setUploading(true)
    setResult(null)
    const total = analysis.matched.length
    setProgress({ current: 0, total })

    let uploaded = 0
    let failed = 0

    for (let i = 0; i < analysis.matched.length; i++) {
      const { file, member } = analysis.matched[i]
      setProgress({ current: i + 1, total })

      try {
        const uploadPath = IMAGE_UPLOAD_PATHS[effectiveColumn] ?? 'images'
        const url = await uploadImage(workspaceId, file, uploadPath)

        // Determine where this column is stored
        if (KNOWN_IMAGE_FIELDS.has(effectiveColumn)) {
          // Known field — stored directly on the Member document
          await updateMember(workspaceId, member.id, {
            [effectiveColumn]: url,
          } as Partial<Omit<Member, 'id' | 'createdAt' | 'updatedAt' | 'workspaceId'>>)
        } else {
          // Custom column — stored in customFields
          await updateMember(workspaceId, member.id, {
            customFields: { ...member.customFields, [effectiveColumn]: url },
          })
        }

        uploaded++
      } catch (err) {
        console.error(`Failed to upload ${file.name}:`, err)
        failed++
      }
    }

    setUploading(false)
    setResult({ uploaded, failed, unmatched: analysis.unmatched.length + analysis.duplicates.length })

    if (uploaded > 0 && failed === 0) {
      toast.success(`Uploaded ${uploaded} images`, {
        description: `Column "${effectiveColumn}" updated for ${uploaded} members.`,
      })
    } else if (uploaded > 0) {
      toast.warning(`Uploaded ${uploaded} images, ${failed} failed`)
    } else {
      toast.error('All uploads failed')
    }
  }, [effectiveColumn, analysis, workspaceId])

  // Reset when dialog closes
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setFiles([])
        setResult(null)
        setSelectedColumn('')
        setProgress({ current: 0, total: 0 })
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
      onOpenChange(next)
    },
    [onOpenChange],
  )

  const canUpload =
    !uploading &&
    effectiveColumn &&
    analysis.matched.length > 0 &&
    analysis.duplicates.length === 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayersIcon className="size-4" />
            Bulk Image Upload
          </DialogTitle>
          <DialogDescription>
            Upload images matched by filename number to row numbers in{' '}
            <strong>{subfolderName}</strong>.
          </DialogDescription>
        </DialogHeader>

        {/* Target column selector */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Target Image Column</label>
          {imageColumns.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No image columns defined. Edit the table to add image columns first.
            </p>
          ) : (
            <Select value={effectiveColumn} onValueChange={setSelectedColumn}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select column" />
              </SelectTrigger>
              <SelectContent>
                {imageColumns.map((col) => (
                  <SelectItem key={col} value={col}>
                    {col}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* File picker */}
        {imageColumns.length > 0 && (
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <ImageIcon data-icon="inline-start" />
              {files.length > 0
                ? `${files.length} file${files.length > 1 ? 's' : ''} selected`
                : 'Select Images'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            <p className="text-xs text-muted-foreground">
              Name files by row number: <code>1.jpg</code>, <code>2.png</code>,{' '}
              <code>15.jpeg</code>, etc.
            </p>
          </div>
        )}

        {/* Analysis preview */}
        {files.length > 0 && (
          <>
            <Separator />
            <div className="flex flex-col gap-3">
              <h4 className="text-sm font-medium">File Analysis</h4>

              {/* Summary badges */}
              <div className="flex flex-wrap gap-2">
                <Badge variant="default" className="gap-1">
                  <CheckCircle2Icon className="size-3" />
                  {analysis.matched.length} matched
                </Badge>
                {analysis.unmatched.length > 0 && (
                  <Badge variant="secondary" className="gap-1">
                    <XCircleIcon className="size-3" />
                    {analysis.unmatched.length} unmatched
                  </Badge>
                )}
                {analysis.duplicates.length > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangleIcon className="size-3" />
                    {analysis.duplicates.length} duplicate
                  </Badge>
                )}
              </div>

              {/* Matched files list */}
              {analysis.matched.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Will upload:
                  </span>
                  <div className="max-h-32 overflow-y-auto rounded-lg border p-2 text-xs space-y-0.5">
                    {analysis.matched.map((m) => (
                      <div
                        key={m.file.name}
                        className="flex items-center justify-between"
                      >
                        <span className="text-foreground">
                          {m.file.name}
                        </span>
                        <span className="text-muted-foreground">
                          → Row #{m.rowNumber}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unmatched files */}
              {analysis.unmatched.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-destructive">
                    Unmatched (will skip):
                  </span>
                  <div className="max-h-24 overflow-y-auto rounded-lg border border-destructive/20 p-2 text-xs space-y-0.5">
                    {analysis.unmatched.map((u) => (
                      <div key={u.filename} className="text-muted-foreground">
                        {u.filename}
                        {u.number !== null
                          ? ` — Row #${u.number} not found`
                          : ' — No number in filename'}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Duplicates */}
              {analysis.duplicates.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-destructive">
                    Duplicates (resolve before uploading):
                  </span>
                  <div className="max-h-24 overflow-y-auto rounded-lg border border-destructive/20 p-2 text-xs space-y-0.5">
                    {analysis.duplicates.map((d) => (
                      <div key={d.filename} className="text-muted-foreground">
                        {d.filename} — duplicate #{d.number}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Upload progress */}
        {uploading && (
          <>
            <Separator />
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Spinner className="size-3.5" />
                  Uploading {progress.current} / {progress.total}
                </span>
                <span className="font-mono text-xs tabular-nums">
                  {Math.round((progress.current / progress.total) * 100)}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${
                      progress.total > 0
                        ? (progress.current / progress.total) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          </>
        )}

        {/* Completion result */}
        {result && !uploading && (
          <>
            <Separator />
            <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
              <span className="font-medium">Upload Complete</span>
              <div className="flex flex-wrap gap-3 text-xs">
                <span className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle2Icon className="size-3" />
                  {result.uploaded} uploaded
                </span>
                {result.failed > 0 && (
                  <span className="flex items-center gap-1 text-destructive">
                    <XCircleIcon className="size-3" />
                    {result.failed} failed
                  </span>
                )}
                {result.unmatched > 0 && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <AlertTriangleIcon className="size-3" />
                    {result.unmatched} skipped
                  </span>
                )}
              </div>
            </div>
          </>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={uploading}
          >
            {result ? 'Close' : 'Cancel'}
          </Button>
          {!result && (
            <Button onClick={handleUpload} disabled={!canUpload}>
              {uploading && <Spinner data-icon="inline-start" />}
              {uploading
                ? `Uploading ${progress.current}/${progress.total}`
                : `Upload ${analysis.matched.length} Images`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
