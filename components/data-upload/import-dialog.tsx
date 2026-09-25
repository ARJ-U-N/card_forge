'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import {
  AlertCircleIcon,
  CheckCircleIcon,
  FileSpreadsheetIcon,
  UploadIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { createManyMembers, getNextRowNumber } from '@/lib/firebase/member-repository'
import { updateFolderColumns } from '@/lib/firebase/folder-repository'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A parsed row from the Excel/CSV file — raw key-value pairs */
interface ParsedRow {
  index: number
  data: Record<string, string>
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  folderId: string
  /** Active subfolder ID (null when no subfolder is selected) */
  subfolderId?: string | null
  /** Existing table columns for this folder (if any) */
  existingColumns?: string[]
}

export function ImportDialog({
  open,
  onOpenChange,
  workspaceId,
  folderId,
  subfolderId = null,
  existingColumns,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState(false)

  // -----------------------------------------------------------------------
  // Parse file — no header validation, no mapping, preserve everything
  // -----------------------------------------------------------------------

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setImported(false)

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]

        // Extract headers in original order
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          defval: '',
        })

        if (json.length === 0) {
          setHeaders([])
          setRows([])
          return
        }

        // Preserve original column order from the first row's keys
        const cols = Object.keys(json[0])
        setHeaders(cols)

        // Convert all values to strings, preserve every column
        const parsed: ParsedRow[] = json.map((raw, i) => {
          const rowData: Record<string, string> = {}
          for (const col of cols) {
            rowData[col] = String(raw[col] ?? '')
          }
          return { index: i + 1, data: rowData }
        })

        setRows(parsed)
      } catch {
        toast.error('Failed to parse file', {
          description: 'Make sure the file is a valid CSV or XLSX.',
        })
        setHeaders([])
        setRows([])
      }
    }
    reader.readAsArrayBuffer(file)
  }

  // -----------------------------------------------------------------------
  // Import — store all data in customFields, set folder columns
  // -----------------------------------------------------------------------

  const handleImport = async () => {
    if (rows.length === 0) return
    setImporting(true)
    try {
      const hasTable = existingColumns && existingColumns.length > 0

      // Build member documents — all values go into customFields
      const members = rows.map((r) => {
        // When the folder already has a table, map Excel values by POSITION
        // to the existing table column names (ignore Excel header names).
        // When no table exists, use Excel headers as-is (legacy behavior).
        let customFields: Record<string, string>
        if (hasTable) {
          customFields = {}
          const excelValues = Object.values(r.data)
          for (let i = 0; i < existingColumns.length; i++) {
            customFields[existingColumns[i]] = excelValues[i] ?? ''
          }
        } else {
          customFields = { ...r.data }
        }

        return {
          folderId,
          subfolderId: subfolderId ?? null,
          // Predefined CardForge fields default to empty for compatibility
          firstName: '',
          lastName: '',
          dateOfBirth: '',
          title: '',
          gender: '' as '' | 'male' | 'female' | 'other',
          employeeId: '',
          idNumber: '',
          department: '',
          hireDate: '',
          expireDate: '',
          parentPhone: '',
          branch: '',
          roomId: '',
          profileImage: '',
          signature: '',
          fingerprint: '',
          divisionLogo: '',
          customFields,
        }
      })

      // Get the next available row number for this subfolder
      const startRowNumber = await getNextRowNumber(workspaceId, folderId, subfolderId ?? null)

      const count = await createManyMembers(workspaceId, members.map((m, i) => ({
        ...m,
        rowNumber: startRowNumber + i,
      })))

      // Only set folder columns when NO table exists yet (first import creates the table).
      // When a table already exists, do NOT overwrite it with Excel headers.
      if (!hasTable) {
        await updateFolderColumns(workspaceId, folderId, headers, false)
      }

      toast.success(`Imported ${count} row${count !== 1 ? 's' : ''}`)
      setImported(true)
    } catch (error) {
      toast.error('Import failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setImporting(false)
    }
  }

  const reset = () => {
    setRows([])
    setHeaders([])
    setFileName(null)
    setImported(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  // When a table exists, preview using the table column names (position-based)
  const hasTable = existingColumns && existingColumns.length > 0
  const displayCols = hasTable ? existingColumns.slice(0, 5) : headers.slice(0, 5)
  const totalDisplayCols = hasTable ? existingColumns.length : headers.length
  const hasMoreCols = totalDisplayCols > 5

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset()
        onOpenChange(v)
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UploadIcon className="size-4" />
            Import Table Data
          </DialogTitle>
          <DialogDescription>
            {existingColumns && existingColumns.length > 0
              ? 'Upload a CSV or Excel file. Values will be imported by column position into your existing table headings.'
              : 'Upload a CSV or Excel file. All columns and data will be preserved exactly as-is.'}
          </DialogDescription>
        </DialogHeader>

        {/* File picker */}
        {!fileName && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-8 text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
          >
            <FileSpreadsheetIcon className="size-10" />
            <span className="text-sm font-medium">
              Click to select a CSV or XLSX file
            </span>
            <span className="text-xs">
              Any column headings are accepted — no special format required.
            </span>
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={handleFile}
        />

        {/* Results */}
        {fileName && rows.length > 0 && (
          <div className="flex flex-col gap-3 overflow-auto">
            <div className="flex items-center gap-2 text-sm">
              <FileSpreadsheetIcon className="size-4 text-muted-foreground" />
              <span className="font-medium">{fileName}</span>
              <span className="text-muted-foreground">
                — {rows.length} row{rows.length !== 1 ? 's' : ''}, {headers.length} column{headers.length !== 1 ? 's' : ''}
              </span>
              <Button
                variant="ghost"
                size="xs"
                onClick={reset}
                disabled={importing}
              >
                Change
              </Button>
            </div>

            {imported ? (
              <Alert>
                <CheckCircleIcon />
                <AlertTitle>Import complete</AlertTitle>
                <AlertDescription>
                  {rows.length} row{rows.length !== 1 ? 's' : ''} imported
                  successfully.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                {/* Data preview table */}
                <div className="max-h-48 overflow-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs w-12">Row</TableHead>
                        {displayCols.map((col) => (
                          <TableHead key={col} className="text-xs">
                            {col}
                          </TableHead>
                        ))}
                        {hasMoreCols && (
                          <TableHead className="text-xs text-muted-foreground">
                            +{totalDisplayCols - 5} more
                          </TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.slice(0, 5).map((r) => {
                        // Get values in positional order
                        const excelValues = Object.values(r.data)
                        return (
                          <TableRow key={r.index}>
                            <TableCell className="font-mono text-xs">{r.index}</TableCell>
                            {displayCols.map((col, colIdx) => (
                              <TableCell key={col} className="text-xs max-w-[150px] truncate">
                                {(hasTable ? excelValues[colIdx] : r.data[col]) || '—'}
                              </TableCell>
                            ))}
                            {hasMoreCols && (
                              <TableCell className="text-xs text-muted-foreground">…</TableCell>
                            )}
                          </TableRow>
                        )
                      })}
                      {rows.length > 5 && (
                        <TableRow>
                          <TableCell
                            colSpan={displayCols.length + 1 + (hasMoreCols ? 1 : 0)}
                            className="text-xs text-center text-muted-foreground"
                          >
                            …and {rows.length - 5} more row{rows.length - 5 !== 1 ? 's' : ''}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {hasTable && (
                  <p className="text-xs text-muted-foreground">
                    Values will be mapped by column position into your table headings. Ensure your Excel columns are in the same order.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {fileName && rows.length === 0 && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>No data found</AlertTitle>
            <AlertDescription>
              The file appears to be empty or could not be parsed.
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset()
              onOpenChange(false)
            }}
            disabled={importing}
          >
            {imported ? 'Close' : 'Cancel'}
          </Button>
          {!imported && rows.length > 0 && (
            <Button onClick={handleImport} disabled={importing}>
              {importing && <Spinner data-icon="inline-start" />}
              {importing
                ? 'Importing…'
                : `Import ${rows.length} row${rows.length !== 1 ? 's' : ''}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
