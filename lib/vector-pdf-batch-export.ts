/**
 * Sheet-level Batched Vector PDF Export Orchestrator (Phase 1 — A4 / A3)
 *
 * Architecture
 * ────────────
 * Instead of calculating a predetermined batch size and passing all members
 * at once to generateVectorPDF(), this orchestrator:
 *
 *   1. Opens a jsPDF document for the current batch.
 *   2. Renders ONE complete physical sheet (front + back for duplex).
 *   3. Asks the AdaptiveBatchController whether to continue.
 *   4. If Normal → renders the next sheet into the same batch PDF.
 *   5. If Caution/Critical → saves the completed batch to disk, starts a new batch.
 *
 * A physical sheet is the smallest indivisible unit of work. Intermediate
 * batches contain only completed sheets. Only the final batch may have a
 * partial sheet (the dataset may end before a sheet fills).
 *
 * No website-side merging
 * ───────────────────────
 * Batch PDFs are saved directly to the user's selected local folder via the
 * File System Access API. The website does NOT merge them into a final PDF.
 * A separate offline utility (Python, Phase 2) will handle merging.
 *
 * Layout source of truth
 * ──────────────────────
 * All layout calculations (cards per page, margins, gaps, etc.) come from
 * the existing Print Layout & PDF Export configuration. No hardcoded values.
 *
 * File System Access API
 * ──────────────────────
 * Requires Chrome/Edge ≥ 86. Firefox and Safari are NOT supported.
 * Browser compatibility is enforced at the application level.
 */

import type { Design, Member } from '@/lib/models/types'
import type { RenderedCard } from '@/lib/card-renderer'
import {
  calculateLayout,
  type PrintConfig,
  type LayoutMode,
} from '@/lib/print-layout'
import {
  renderSheetToExistingPDF,
  createVectorPDF,
  finalizePDFAsBlob,
  clearVectorImageCache,
  type VectorPDFHandle,
} from '@/lib/vector-pdf-renderer'
import {
  AdaptiveBatchController,
  BATCH_THRESHOLD_SHEETS,
  MAX_SHEET_RETRIES,
  type SheetMetrics,
  type BatchSummary,
} from '@/lib/vector-pdf-batch-controller'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface BatchedVectorPDFInput {
  design: Design
  members: Member[]
  config: PrintConfig
  renderedCards?: RenderedCard[]
  isPortal?: boolean
  /** User-selected directory handle for writing batch PDFs. */
  dirHandle: FileSystemDirectoryHandle
  /** Checked between sheets — return true to cancel the export. */
  isCancelled: () => boolean
  /**
   * Progress callback — reports cards completed out of total cards.
   * Preserves the existing progress UI exactly (cards, not pages/sheets).
   */
  onProgress?: (currentCards: number, totalCards: number, status: string) => void
}

export interface BatchedExportResult {
  success: boolean
  totalPages: number
  totalBatches: number
  totalMembers: number
  batchFolder: string | null
  error?: string
}

// ---------------------------------------------------------------------------
// Manifest (persisted as JSON alongside batch files for recovery)
// ---------------------------------------------------------------------------

interface ManifestBatch {
  filename: string
  batchIndex: number
  /** Global member start index (inclusive) */
  memberStartIndex: number
  /** Global member end index (exclusive) */
  memberEndIndex: number
  /** Global sheet start index (inclusive) */
  sheetStartIndex: number
  /** Global sheet end index (exclusive) */
  sheetEndIndex: number
  sheetCount: number
  pageCount: number
  studentCount: number
  outputSizeBytes: number
  durationMs: number
  status: 'completed' | 'failed'
}

interface BatchManifest {
  version: 2
  exportType: 'vector-pdf'
  paperSize: string
  orientation: string
  printMode: string
  layoutMode: string
  cardsPerPage: number
  timestamp: string
  totalMembers: number
  studentsPerSheet: number
  pagesPerSheet: number
  totalSheets: number
  batches: ManifestBatch[]
  status: 'in-progress' | 'completed' | 'failed' | 'cancelled'
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Number of students (members) that fill one physical sheet. */
export function getStudentsPerSheet(cardsPerPage: number, printMode: string): number {
  if (printMode === 'side-by-side') {
    return Math.max(1, Math.floor(cardsPerPage / 2))
  }
  // front-only, back-only, duplex all fit cardsPerPage students per sheet
  return Math.max(1, cardsPerPage)
}

/** Number of PDF pages that one physical sheet produces. */
function getPagesPerSheet(printMode: string): number {
  return printMode === 'duplex' ? 2 : 1
}

// ---------------------------------------------------------------------------
// Feature detection
// ---------------------------------------------------------------------------

export function isFileSystemAccessSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'showDirectoryPicker' in window &&
    typeof (window as any).showDirectoryPicker === 'function'
  )
}

// ---------------------------------------------------------------------------
// Threshold check
// ---------------------------------------------------------------------------

/**
 * Determine whether the export should use batching.
 *
 * Returns true when:
 * 1. Paper size is A4 or A3.
 * 2. The total number of sheets exceeds BATCH_THRESHOLD_SHEETS.
 */
export function shouldUseBatchedExport(
  memberCount: number,
  config: PrintConfig,
  cardOrientation: 'horizontal' | 'vertical' = 'horizontal',
  customCardMm?: { w: number; h: number },
): boolean {
  if (config.paperSize !== 'a4' && config.paperSize !== 'a3') return false
  if (memberCount <= 0) return false

  const layout = calculateLayout(config, cardOrientation, customCardMm)
  const sps = getStudentsPerSheet(layout.cardsPerPage, config.printMode)
  const totalSheets = Math.ceil(memberCount / sps)

  return totalSheets > BATCH_THRESHOLD_SHEETS
}

// ---------------------------------------------------------------------------
// File System helpers
// ---------------------------------------------------------------------------

async function writeBlob(
  dirHandle: FileSystemDirectoryHandle,
  filename: string,
  data: Blob | Uint8Array | ArrayBuffer,
): Promise<void> {
  const fh = await dirHandle.getFileHandle(filename, { create: true })
  const writable = await fh.createWritable()
  await writable.write(data)
  await writable.close()
}

async function writeJSON(
  dirHandle: FileSystemDirectoryHandle,
  filename: string,
  obj: unknown,
): Promise<void> {
  const json = JSON.stringify(obj, null, 2)
  await writeBlob(dirHandle, filename, new Blob([json], { type: 'application/json' }))
}

// ---------------------------------------------------------------------------
// Main orchestrator — sheet-by-sheet with adaptive checkpoints
// ---------------------------------------------------------------------------

export async function batchedVectorPDFExport(
  input: BatchedVectorPDFInput,
): Promise<BatchedExportResult> {
  const {
    design,
    members,
    config,
    renderedCards,
    isPortal,
    dirHandle,
    isCancelled,
    onProgress,
  } = input

  const cardConfig = design.cardConfiguration
  const customCardMm =
    cardConfig.cardWidthMm && cardConfig.cardHeightMm
      ? { w: cardConfig.cardWidthMm, h: cardConfig.cardHeightMm }
      : undefined

  // ── Layout from existing Print Layout configuration ────────────────
  // For rotated-90, compute the effective config (landscape + swapped axes)
  // exactly as generateVectorPDF does, so the layout is identical.
  const isRotated90 = config.layoutMode === 'rotated-90'
  const effectiveConfig: PrintConfig = isRotated90
    ? {
      ...config,
      layoutMode: (config.autoLayout ? 'automatic' : 'custom') as LayoutMode,
      orientation: 'landscape' as const,
      gutterH: config.gutterV,
      gutterV: config.gutterH,
      rows: config.columns,
      columns: config.rows,
      margins: {
        left: config.margins.top,
        right: config.margins.bottom,
        top: config.margins.right,
        bottom: config.margins.left,
      },
      frontAdjustment: {
        offsetX: config.frontAdjustment.offsetY,
        offsetY: -config.frontAdjustment.offsetX,
        rotation: config.frontAdjustment.rotation,
      },
      backAdjustment: {
        offsetX: config.backAdjustment.offsetY,
        offsetY: -config.backAdjustment.offsetX,
        rotation: config.backAdjustment.rotation,
      },
    }
    : config

  const layout = calculateLayout(effectiveConfig, cardConfig.orientation, customCardMm)
  const studentsPerSheet = getStudentsPerSheet(layout.cardsPerPage, config.printMode)
  const pagesPerSheet = getPagesPerSheet(config.printMode)
  const totalSheets = Math.ceil(members.length / studentsPerSheet)
  const totalCards = members.length
  const tempFolderName = `.cardforge-batch-${Date.now()}`

  // ── Create batch subfolder ─────────────────────────────────────────
  let batchDir: FileSystemDirectoryHandle
  try {
    batchDir = await dirHandle.getDirectoryHandle(tempFolderName, { create: true })
  } catch (err) {
    return {
      success: false,
      totalPages: totalSheets * pagesPerSheet,
      totalBatches: 0,
      totalMembers: members.length,
      batchFolder: null,
      error: `Failed to create export folder: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  // ── Initialise manifest ────────────────────────────────────────────
  const manifest: BatchManifest = {
    version: 2,
    exportType: 'vector-pdf',
    paperSize: config.paperSize,
    orientation: config.orientation,
    printMode: config.printMode,
    layoutMode: config.layoutMode,
    cardsPerPage: layout.cardsPerPage,
    timestamp: new Date().toISOString(),
    totalMembers: members.length,
    studentsPerSheet,
    pagesPerSheet,
    totalSheets,
    batches: [],
    status: 'in-progress',
  }
  await writeJSON(batchDir, 'manifest.json', manifest)

  // ── Adaptive controller ────────────────────────────────────────────
  const controller = new AdaptiveBatchController()

  let globalSheetIndex = 0  // Which physical sheet we're on (0-based)
  let processedMembers = 0  // Global member cursor
  let completedCards = 0    // For progress reporting (card count)
  let batchIndex = 0
  let totalPagesWritten = 0

  // ── Main loop: process sheets across batches ───────────────────────
  while (globalSheetIndex < totalSheets) {
    // Check cancellation between batches
    if (isCancelled()) {
      manifest.status = 'cancelled'
      await writeJSON(batchDir, 'manifest.json', manifest).catch(() => {})
      return {
        success: false,
        totalPages: totalPagesWritten,
        totalBatches: batchIndex,
        totalMembers: members.length,
        batchFolder: tempFolderName,
        error: 'Export cancelled by user.',
      }
    }

    // ── Start a new batch ──────────────────────────────────────────
    controller.startBatch()
    const batchFilename = `batch-${String(batchIndex + 1).padStart(3, '0')}.pdf`
    const batchStartTime = performance.now()
    const batchStartSheetIndex = globalSheetIndex
    const batchStartMemberIndex = processedMembers

    let pdfHandle: VectorPDFHandle | null = null
    let batchSheetsCompleted = 0
    let batchPagesRendered = 0
    let batchStudentsRendered = 0
    let batchAbortReason = ''
    let batchFailed = false

    try {
      // Create a new jsPDF document for this batch
      pdfHandle = await createVectorPDF(design, config, customCardMm)

      // ── Sheet loop within this batch ─────────────────────────────
      while (globalSheetIndex < totalSheets) {
        // Pre-sheet decision: should we start another sheet?
        if (batchSheetsCompleted > 0) {
          const preDecision = controller.shouldStartNextSheet()
          if (!preDecision.continueInBatch) {
            console.log(`[batch-export] Pre-sheet check: ${preDecision.reason}`)
            break
          }
        }

        // Check cancellation between sheets
        if (isCancelled()) {
          break
        }

        // Determine members for this sheet
        const sheetMemberStart = globalSheetIndex * studentsPerSheet
        const sheetMemberEnd = Math.min(sheetMemberStart + studentsPerSheet, members.length)
        const sheetMembers = members.slice(sheetMemberStart, sheetMemberEnd)
        const sheetStudentCount = sheetMembers.length

        // Render one complete physical sheet
        const sheetStartTime = performance.now()
        let sheetSuccess = false

        try {
          const pagesRendered = await renderSheetToExistingPDF(
            pdfHandle,
            design,
            sheetMembers,
            sheetMemberStart, // global member offset for correct ordering
            config,
            layout,
            isPortal || false,
            batchPagesRendered, // page offset within this batch's PDF
          )

          sheetSuccess = true
          const sheetDurationMs = performance.now() - sheetStartTime

          batchSheetsCompleted++
          batchPagesRendered += pagesRendered
          batchStudentsRendered += sheetStudentCount

          // Update global progress (card-based, matching existing UI)
          completedCards = sheetMemberEnd
          onProgress?.(
            completedCards,
            totalCards,
            `Rendering card ${completedCards} of ${totalCards}…`,
          )

          // Post-sheet decision
          const sheetMetrics: SheetMetrics = {
            sheetDurationMs,
            studentCount: sheetStudentCount,
            pageCount: pagesRendered,
            success: true,
          }
          const decision = controller.recordSheet(sheetMetrics, globalSheetIndex)
          console.log(`[batch-export] Sheet ${globalSheetIndex + 1}/${totalSheets}: ${Math.round(sheetDurationMs)}ms → ${decision.state} (${decision.reason})`)

          globalSheetIndex++
          processedMembers = sheetMemberEnd

          if (!decision.continueInBatch) {
            break
          }
        } catch (err) {
          // Sheet rendering failed
          const sheetDurationMs = performance.now() - sheetStartTime
          console.error(`[batch-export] Sheet ${globalSheetIndex + 1} render failed:`, err)

          const sheetMetrics: SheetMetrics = {
            sheetDurationMs,
            studentCount: sheetStudentCount,
            pageCount: 0,
            success: false,
          }
          const decision = controller.recordSheet(sheetMetrics, globalSheetIndex)

          if (controller.isSheetPermanentlyFailed()) {
            // This sheet can't be rendered — abort entirely
            batchAbortReason = `Sheet ${globalSheetIndex + 1} failed ${MAX_SHEET_RETRIES} times: ${err instanceof Error ? err.message : String(err)}`
            batchFailed = true

            // If we have completed sheets, save them first
            if (batchSheetsCompleted > 0) {
              break
            }

            // No completed sheets — record failure and return
            manifest.batches.push({
              filename: batchFilename,
              batchIndex,
              memberStartIndex: batchStartMemberIndex,
              memberEndIndex: processedMembers,
              sheetStartIndex: batchStartSheetIndex,
              sheetEndIndex: batchStartSheetIndex,
              sheetCount: 0,
              pageCount: 0,
              studentCount: 0,
              outputSizeBytes: 0,
              durationMs: performance.now() - batchStartTime,
              status: 'failed',
            })
            manifest.status = 'failed'
            await writeJSON(batchDir, 'manifest.json', manifest).catch(() => {})
            clearVectorImageCache()

            return {
              success: false,
              totalPages: totalPagesWritten,
              totalBatches: batchIndex + 1,
              totalMembers: members.length,
              batchFolder: tempFolderName,
              error: batchAbortReason,
            }
          }

          // Sheet failed but can retry — discard incomplete sheet, save batch
          // The incomplete sheet's PDF pages need to be discarded.
          // Since we haven't advanced globalSheetIndex, the next batch
          // will re-process this sheet from scratch.
          // We need a fresh PDF for the next batch, so just break here.
          // The current PDF contains only the previously completed sheets.
          break
        }
      }
    } catch (err) {
      // Fatal error creating/initialising the batch PDF
      console.error(`[batch-export] Batch ${batchIndex + 1} initialisation failed:`, err)
      manifest.batches.push({
        filename: batchFilename,
        batchIndex,
        memberStartIndex: batchStartMemberIndex,
        memberEndIndex: processedMembers,
        sheetStartIndex: batchStartSheetIndex,
        sheetEndIndex: batchStartSheetIndex,
        sheetCount: 0,
        pageCount: 0,
        studentCount: 0,
        outputSizeBytes: 0,
        durationMs: performance.now() - batchStartTime,
        status: 'failed',
      })
      manifest.status = 'failed'
      await writeJSON(batchDir, 'manifest.json', manifest).catch(() => {})
      clearVectorImageCache()

      return {
        success: false,
        totalPages: totalPagesWritten,
        totalBatches: batchIndex + 1,
        totalMembers: members.length,
        batchFolder: tempFolderName,
        error: `Batch ${batchIndex + 1} failed: ${err instanceof Error ? err.message : String(err)}`,
      }
    }

    // ── Save completed sheets in this batch ─────────────────────────
    if (batchSheetsCompleted > 0 && pdfHandle) {
      try {
        const batchBlob = await finalizePDFAsBlob(pdfHandle)
        const outputSizeBytes = batchBlob.size

        await writeBlob(batchDir, batchFilename, batchBlob)

        const batchDurationMs = performance.now() - batchStartTime

        manifest.batches.push({
          filename: batchFilename,
          batchIndex,
          memberStartIndex: batchStartMemberIndex,
          memberEndIndex: processedMembers,
          sheetStartIndex: batchStartSheetIndex,
          sheetEndIndex: batchStartSheetIndex + batchSheetsCompleted,
          sheetCount: batchSheetsCompleted,
          pageCount: batchPagesRendered,
          studentCount: batchStudentsRendered,
          outputSizeBytes,
          durationMs: batchDurationMs,
          status: 'completed',
        })
        await writeJSON(batchDir, 'manifest.json', manifest).catch(() => {})

        const memSnapshot = controller.takeMemorySnapshot()
        controller.recordBatch({
          batchIndex,
          sheetsCompleted: batchSheetsCompleted,
          totalDurationMs: batchDurationMs,
          totalStudents: batchStudentsRendered,
          totalPages: batchPagesRendered,
          finalState: 'normal',
          memorySnapshot: memSnapshot,
        })

        totalPagesWritten += batchPagesRendered
        batchIndex++
      } catch (err) {
        console.error(`[batch-export] Batch ${batchIndex + 1} write failed:`, err)
        manifest.batches.push({
          filename: batchFilename,
          batchIndex,
          memberStartIndex: batchStartMemberIndex,
          memberEndIndex: processedMembers,
          sheetStartIndex: batchStartSheetIndex,
          sheetEndIndex: batchStartSheetIndex + batchSheetsCompleted,
          sheetCount: batchSheetsCompleted,
          pageCount: batchPagesRendered,
          studentCount: batchStudentsRendered,
          outputSizeBytes: 0,
          durationMs: performance.now() - batchStartTime,
          status: 'failed',
        })
        manifest.status = 'failed'
        await writeJSON(batchDir, 'manifest.json', manifest).catch(() => {})
        clearVectorImageCache()

        return {
          success: false,
          totalPages: totalPagesWritten,
          totalBatches: batchIndex + 1,
          totalMembers: members.length,
          batchFolder: tempFolderName,
          error: `Failed to write batch ${batchIndex + 1}: ${err instanceof Error ? err.message : String(err)}`,
        }
      }
    }

    // ── Release batch resources ───────────────────────────────────────
    clearVectorImageCache()
    pdfHandle = null

    // If the batch was aborted due to permanent sheet failure, stop
    if (batchFailed) {
      manifest.status = 'failed'
      await writeJSON(batchDir, 'manifest.json', manifest).catch(() => {})
      return {
        success: false,
        totalPages: totalPagesWritten,
        totalBatches: batchIndex,
        totalMembers: members.length,
        batchFolder: tempFolderName,
        error: batchAbortReason,
      }
    }

    // Check cancellation after batch
    if (isCancelled()) {
      manifest.status = 'cancelled'
      await writeJSON(batchDir, 'manifest.json', manifest).catch(() => {})
      return {
        success: false,
        totalPages: totalPagesWritten,
        totalBatches: batchIndex,
        totalMembers: members.length,
        batchFolder: tempFolderName,
        error: 'Export cancelled by user.',
      }
    }

    // Yield to main thread between batches
    await new Promise((r) => setTimeout(r, 50))
  }

  // ── All sheets processed successfully ──────────────────────────────
  onProgress?.(totalCards, totalCards, 'Export complete')
  manifest.status = 'completed'
  await writeJSON(batchDir, 'manifest.json', manifest).catch(() => {})

  return {
    success: true,
    totalPages: totalPagesWritten,
    totalBatches: batchIndex,
    totalMembers: members.length,
    batchFolder: tempFolderName,
  }
}
