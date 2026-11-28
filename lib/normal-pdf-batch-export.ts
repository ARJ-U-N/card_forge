/**
 * Sheet-level Batched Normal PDF (Raster) Export Orchestrator — A4 Only
 *
 * Architecture
 * ────────────
 * Mirrors the Vector PDF batched export architecture but uses the Normal PDF
 * (raster) rendering pipeline. Cards are pre-rendered as data-URL images
 * (RenderedCard.frontDataUrl / backDataUrl) and placed onto jsPDF pages with
 * addImage() — the same approach as the existing one-shot generatePDF().
 *
 * The orchestrator:
 *   1. Opens a new jsPDF document for the current batch.
 *   2. Renders ONE complete physical sheet (front + back for duplex).
 *   3. Asks the AdaptiveBatchController whether to continue.
 *   4. If Normal → renders the next sheet into the same batch PDF.
 *   5. If Caution/Critical → saves the completed batch to disk, starts a new batch.
 *
 * Shared infrastructure
 * ─────────────────────
 * Reuses from the Vector PDF batching system:
 *   • AdaptiveBatchController (paper-size-agnostic)
 *   • BATCH_THRESHOLD_SHEETS
 *   • MAX_SHEET_RETRIES
 *   • isFileSystemAccessSupported() (from vector-pdf-batch-export)
 *   • getStudentsPerSheet() (from vector-pdf-batch-export)
 *
 * Normal-PDF-specific:
 *   • Rendering uses RenderedCard[] (pre-rasterised card images)
 *   • Page composition uses jsPDF.addImage() with crop marks, borders, watermarks
 *   • No PDF background post-processing (unlike Vector PDF)
 *
 * File System Access API
 * ──────────────────────
 * Requires Chrome/Edge ≥ 86. Firefox and Safari are NOT supported.
 */

import type { RenderedCard } from '@/lib/card-renderer'
import {
  calculateLayout,
  distributeCards,
  type PrintConfig,
  type PrintPage,
  type PageLayout,
} from '@/lib/print-layout'
import { drawVectorWatermark } from '@/lib/vector-pdf-renderer'
import {
  AdaptiveBatchController,
  BATCH_THRESHOLD_SHEETS,
  MAX_SHEET_RETRIES,
  type SheetMetrics,
} from '@/lib/vector-pdf-batch-controller'
import {
  getStudentsPerSheet,
  isFileSystemAccessSupported,
} from '@/lib/vector-pdf-batch-export'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface BatchedNormalPDFInput {
  cards: RenderedCard[]
  config: PrintConfig
  cardOrientation: 'horizontal' | 'vertical'
  customCardMm?: { w: number; h: number }
  addWatermark?: boolean
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

export interface BatchedNormalPDFResult {
  success: boolean
  totalPages: number
  totalBatches: number
  totalCards: number
  batchFolder: string | null
  error?: string
}

// ---------------------------------------------------------------------------
// Manifest (persisted as JSON alongside batch files)
// ---------------------------------------------------------------------------

interface ManifestBatch {
  filename: string
  batchIndex: number
  cardStartIndex: number
  cardEndIndex: number
  sheetStartIndex: number
  sheetEndIndex: number
  sheetCount: number
  pageCount: number
  cardCount: number
  outputSizeBytes: number
  durationMs: number
  status: 'completed' | 'failed'
}

interface BatchManifest {
  version: 2
  exportType: 'normal-pdf'
  paperSize: string
  orientation: string
  printMode: string
  layoutMode: string
  cardsPerPage: number
  timestamp: string
  totalCards: number
  studentsPerSheet: number
  pagesPerSheet: number
  totalSheets: number
  batches: ManifestBatch[]
  status: 'in-progress' | 'completed' | 'failed' | 'cancelled'
}

// ---------------------------------------------------------------------------
// Helpers — File System Access
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
// Helpers — layout
// ---------------------------------------------------------------------------

/** Number of PDF pages that one physical sheet produces. */
function getPagesPerSheet(printMode: string): number {
  return printMode === 'duplex' ? 2 : 1
}

// ---------------------------------------------------------------------------
// Rotated-90 image cache (matches print-layout.ts approach)
// ---------------------------------------------------------------------------

const rotatedImageCache = new Map<string, string>()

function rotateImageData90(dataUrl: string): Promise<string> {
  const cached = rotatedImageCache.get(dataUrl)
  if (cached) return Promise.resolve(cached)

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.height
      canvas.height = img.width
      const ctx = canvas.getContext('2d')!
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate(Math.PI / 2)
      ctx.drawImage(img, -img.width / 2, -img.height / 2)
      const result = canvas.toDataURL('image/png')
      rotatedImageCache.set(dataUrl, result)
      resolve(result)
    }
    img.onerror = reject
    img.src = dataUrl
  })
}

function clearRotatedImageCache(): void {
  rotatedImageCache.clear()
}

// ---------------------------------------------------------------------------
// Threshold check
// ---------------------------------------------------------------------------

/**
 * Determine whether the Normal PDF export should use batching.
 *
 * Returns true when:
 * 1. Paper size is A4.
 * 2. The total number of sheets exceeds BATCH_THRESHOLD_SHEETS.
 */
export function shouldUseNormalBatchedExport(
  cardCount: number,
  config: PrintConfig,
  cardOrientation: 'horizontal' | 'vertical' = 'horizontal',
  customCardMm?: { w: number; h: number },
): boolean {
  if (config.paperSize !== 'a4' && config.paperSize !== 'a3') return false
  if (cardCount <= 0) return false

  const layout = calculateLayout(config, cardOrientation, customCardMm)
  const sps = getStudentsPerSheet(layout.cardsPerPage, config.printMode)
  const totalSheets = Math.ceil(cardCount / sps)

  return totalSheets > BATCH_THRESHOLD_SHEETS
}

// ---------------------------------------------------------------------------
// Sheet-level rendering — renders one physical sheet's pages into a jsPDF doc
// ---------------------------------------------------------------------------

/**
 * Render the pages for one physical sheet into an existing jsPDF document.
 *
 * A physical sheet is:
 *   - front-only / back-only: 1 page
 *   - duplex: 2 pages (front + back)
 *   - side-by-side: 1 page (front + back side-by-side)
 *
 * Returns the number of PDF pages rendered.
 */
async function renderSheetPages(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdf: any,
  sheetPages: PrintPage[],
  layout: PageLayout,
  config: PrintConfig,
  addWatermark: boolean,
  batchPageOffset: number,
): Promise<number> {
  const CROP_LEN = 3
  const CROP_OFFSET = 1

  for (let pi = 0; pi < sheetPages.length; pi++) {
    const page = sheetPages[pi]
    const globalPageIndex = batchPageOffset + pi

    // Add a new page (skip for the very first page of the PDF)
    if (globalPageIndex > 0) pdf.addPage()

    // Apply side adjustment
    const adj = page.side === 'back' ? config.backAdjustment : config.frontAdjustment
    const hasAdj = adj.offsetX !== 0 || adj.offsetY !== 0 || adj.rotation !== 0
    if (hasAdj && adj.rotation !== 0) {
      pdf.saveGraphicsState()
      const cx = layout.pageW / 2
      const cy = layout.pageH / 2
      const rad = (adj.rotation * Math.PI) / 180
      const cos = Math.cos(rad)
      const sin = Math.sin(rad)
      pdf.setCurrentTransformationMatrix(
        pdf.Matrix(cos, sin, -sin, cos, cx - cx * cos + cy * sin, cy - cx * sin - cy * cos)
      )
    }

    // Draw each card on this page
    for (const { slot, card } of page.cards) {
      let imgData = page.side === 'back' ? card.backDataUrl : card.frontDataUrl

      // For rotated-90 mode, use the pre-rotated image
      if (layout.rotateCards) {
        imgData = rotatedImageCache.get(imgData) ?? imgData
      }

      const drawX = slot.x + adj.offsetX
      const drawY = slot.y + adj.offsetY

      try {
        pdf.addImage(imgData, 'PNG', drawX, drawY, slot.w, slot.h)
      } catch {
        // Skip if image fails
      }

      // Watermark overlay
      if (addWatermark) {
        drawVectorWatermark(pdf, drawX, drawY, slot.w, slot.h)
      }

      // Card borders
      if (config.cardBorders) {
        pdf.setDrawColor(200, 200, 200)
        pdf.setLineWidth(0.2)
        pdf.rect(drawX, drawY, slot.w, slot.h)
      }

      // Crop marks
      if (config.cropMarks) {
        pdf.setDrawColor(0, 0, 0)
        pdf.setLineWidth(0.15)
        pdf.line(drawX - CROP_OFFSET - CROP_LEN, drawY, drawX - CROP_OFFSET, drawY)
        pdf.line(drawX, drawY - CROP_OFFSET - CROP_LEN, drawX, drawY - CROP_OFFSET)
        pdf.line(drawX + slot.w + CROP_OFFSET, drawY, drawX + slot.w + CROP_OFFSET + CROP_LEN, drawY)
        pdf.line(drawX + slot.w, drawY - CROP_OFFSET - CROP_LEN, drawX + slot.w, drawY - CROP_OFFSET)
        pdf.line(drawX - CROP_OFFSET - CROP_LEN, drawY + slot.h, drawX - CROP_OFFSET, drawY + slot.h)
        pdf.line(drawX, drawY + slot.h + CROP_OFFSET, drawX, drawY + slot.h + CROP_OFFSET + CROP_LEN)
        pdf.line(drawX + slot.w + CROP_OFFSET, drawY + slot.h, drawX + slot.w + CROP_OFFSET + CROP_LEN, drawY + slot.h)
        pdf.line(drawX + slot.w, drawY + slot.h + CROP_OFFSET, drawX + slot.w, drawY + slot.h + CROP_OFFSET + CROP_LEN)
      }
    }

    // Side-by-side mode: draw back cards next to fronts
    if (config.printMode === 'side-by-side') {
      for (const { slot, card } of page.cards) {
        const backAdj = config.backAdjustment
        const backX = slot.x + slot.w + config.gutterH + backAdj.offsetX
        const backY = slot.y + backAdj.offsetY
        if (backX + slot.w <= layout.pageW - config.margins.right) {
          let backImg = card.backDataUrl
          if (layout.rotateCards) {
            backImg = rotatedImageCache.get(backImg) ?? backImg
          }
          try {
            pdf.addImage(backImg, 'PNG', backX, backY, slot.w, slot.h)
          } catch { /* skip */ }

          if (addWatermark) {
            drawVectorWatermark(pdf, backX, backY, slot.w, slot.h)
          }
          if (config.cardBorders) {
            pdf.setDrawColor(200, 200, 200)
            pdf.setLineWidth(0.2)
            pdf.rect(backX, backY, slot.w, slot.h)
          }
          if (config.cropMarks) {
            pdf.setDrawColor(0, 0, 0)
            pdf.setLineWidth(0.15)
            pdf.line(backX + slot.w + CROP_OFFSET, backY, backX + slot.w + CROP_OFFSET + CROP_LEN, backY)
            pdf.line(backX + slot.w, backY - CROP_OFFSET - CROP_LEN, backX + slot.w, backY - CROP_OFFSET)
            pdf.line(backX + slot.w + CROP_OFFSET, backY + slot.h, backX + slot.w + CROP_OFFSET + CROP_LEN, backY + slot.h)
            pdf.line(backX + slot.w, backY + slot.h + CROP_OFFSET, backX + slot.w, backY + slot.h + CROP_OFFSET + CROP_LEN)
          }
        }
      }
    }

    // Restore graphics state if we applied rotation adjustment
    if (hasAdj && adj.rotation !== 0) {
      pdf.restoreGraphicsState()
    }

    // Yield to main thread
    await new Promise((r) => setTimeout(r, 0))
  }

  return sheetPages.length
}

// ---------------------------------------------------------------------------
// Main orchestrator — sheet-by-sheet with adaptive checkpoints
// ---------------------------------------------------------------------------

export async function batchedNormalPDFExport(
  input: BatchedNormalPDFInput,
): Promise<BatchedNormalPDFResult> {
  const {
    cards,
    config,
    cardOrientation,
    customCardMm,
    addWatermark = false,
    dirHandle,
    isCancelled,
    onProgress,
  } = input

  // ── Layout from existing Print Layout configuration ────────────────
  const layout = calculateLayout(config, cardOrientation, customCardMm)
  const studentsPerSheet = getStudentsPerSheet(layout.cardsPerPage, config.printMode)
  const pagesPerSheet = getPagesPerSheet(config.printMode)
  const totalSheets = Math.ceil(cards.length / studentsPerSheet)
  const totalCards = cards.length
  const tempFolderName = `.cardforge-batch-normal-${Date.now()}`

  // For rotated-90 mode, always use portrait regardless of config.orientation
  const effectivePdfOrientation = layout.rotateCards ? 'portrait' : config.orientation

  // ── Pre-rotate images if needed ────────────────────────────────────
  if (layout.rotateCards) {
    onProgress?.(0, totalCards, 'Preparing rotated card images…')
    const uniqueUrls = new Set<string>()
    for (const card of cards) {
      uniqueUrls.add(card.frontDataUrl)
      uniqueUrls.add(card.backDataUrl)
    }
    await Promise.all(Array.from(uniqueUrls).map((url) => rotateImageData90(url)))
  }

  // ── Create batch subfolder ─────────────────────────────────────────
  let batchDir: FileSystemDirectoryHandle
  try {
    batchDir = await dirHandle.getDirectoryHandle(tempFolderName, { create: true })
  } catch (err) {
    return {
      success: false,
      totalPages: totalSheets * pagesPerSheet,
      totalBatches: 0,
      totalCards: cards.length,
      batchFolder: null,
      error: `Failed to create export folder: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  // ── Initialise manifest ────────────────────────────────────────────
  const manifest: BatchManifest = {
    version: 2,
    exportType: 'normal-pdf',
    paperSize: config.paperSize,
    orientation: config.orientation,
    printMode: config.printMode,
    layoutMode: config.layoutMode,
    cardsPerPage: layout.cardsPerPage,
    timestamp: new Date().toISOString(),
    totalCards: cards.length,
    studentsPerSheet,
    pagesPerSheet,
    totalSheets,
    batches: [],
    status: 'in-progress',
  }
  await writeJSON(batchDir, 'manifest.json', manifest)

  // ── Adaptive controller ────────────────────────────────────────────
  const controller = new AdaptiveBatchController()

  let globalSheetIndex = 0
  let processedCards = 0
  let completedCards = 0
  let batchIndex = 0
  let totalPagesWritten = 0

  // ── Main loop: process sheets across batches ───────────────────────
  while (globalSheetIndex < totalSheets) {
    if (isCancelled()) {
      manifest.status = 'cancelled'
      await writeJSON(batchDir, 'manifest.json', manifest).catch(() => {})
      clearRotatedImageCache()
      return {
        success: false,
        totalPages: totalPagesWritten,
        totalBatches: batchIndex,
        totalCards: cards.length,
        batchFolder: tempFolderName,
        error: 'Export cancelled by user.',
      }
    }

    // ── Start a new batch ──────────────────────────────────────────
    controller.startBatch()
    const batchFilename = `batch-${String(batchIndex + 1).padStart(3, '0')}.pdf`
    const batchStartTime = performance.now()
    const batchStartSheetIndex = globalSheetIndex
    const batchStartCardIndex = processedCards

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pdf: any = null
    let batchSheetsCompleted = 0
    let batchPagesRendered = 0
    let batchCardsRendered = 0
    let batchAbortReason = ''
    let batchFailed = false

    try {
      // Create a new jsPDF document for this batch
      const { default: jsPDF } = await import('jspdf')
      pdf = new jsPDF({
        orientation: effectivePdfOrientation === 'landscape' ? 'landscape' : 'portrait',
        unit: 'mm',
        format: config.paperSize === 'a4' ? 'a4' : config.paperSize === 'letter' ? 'letter' : config.paperSize === 'legal' ? 'legal' : 'a3',
      })

      // ── Set up page-level /Rotate for duplex rotate-page-180 ──────
      // Collect back page indices as we go, then register the event.
      // For batched rendering, we track which pages within THIS batch are back pages.
      const backPageNumbers = new Set<number>()

      if (config.duplexBack === 'rotate-page-180' && config.printMode === 'duplex') {
        let putPageCounter = 0
        ;(pdf as any).internal.events.subscribe('putPage', function (this: any) {
          putPageCounter++
          if (backPageNumbers.has(putPageCounter)) {
            this.internal.write('/Rotate 180')
          }
        })
      }

      // ── Set up page-level /Rotate for single-sided rotatePage180 ──
      if (config.rotatePage180 && (config.printMode === 'front-only' || config.printMode === 'back-only')) {
        ;(pdf as any).internal.events.subscribe('putPage', function (this: any) {
          this.internal.write('/Rotate 180')
        })
      }

      // ── Sheet loop within this batch ─────────────────────────────
      while (globalSheetIndex < totalSheets) {
        // Pre-sheet decision
        if (batchSheetsCompleted > 0) {
          const preDecision = controller.shouldStartNextSheet()
          if (!preDecision.continueInBatch) {
            console.log(`[normal-batch-export] Pre-sheet check: ${preDecision.reason}`)
            break
          }
        }

        if (isCancelled()) break

        // Determine cards for this sheet
        const sheetCardStart = globalSheetIndex * studentsPerSheet
        const sheetCardEnd = Math.min(sheetCardStart + studentsPerSheet, cards.length)
        const sheetCards = cards.slice(sheetCardStart, sheetCardEnd)
        const sheetCardCount = sheetCards.length

        // Distribute these cards into pages for one sheet
        const sheetPages = distributeCards(
          sheetCards,
          layout,
          config.printMode,
          config.orientation,
          config.duplexBack,
        )

        // Track back page numbers for rotate-page-180
        if (config.duplexBack === 'rotate-page-180' && config.printMode === 'duplex') {
          for (let pi = 0; pi < sheetPages.length; pi++) {
            if (sheetPages[pi].side === 'back') {
              // 1-indexed page number within this batch's PDF
              backPageNumbers.add(batchPagesRendered + pi + 1)
            }
          }
        }

        // Render one complete physical sheet
        const sheetStartTime = performance.now()

        try {
          const pagesRendered = await renderSheetPages(
            pdf,
            sheetPages,
            layout,
            config,
            addWatermark,
            batchPagesRendered,
          )

          const sheetDurationMs = performance.now() - sheetStartTime

          batchSheetsCompleted++
          batchPagesRendered += pagesRendered
          batchCardsRendered += sheetCardCount

          // Update global progress (card-based)
          completedCards = sheetCardEnd
          onProgress?.(
            completedCards,
            totalCards,
            `Rendering card ${completedCards} of ${totalCards}…`,
          )

          // Post-sheet decision
          const sheetMetrics: SheetMetrics = {
            sheetDurationMs,
            studentCount: sheetCardCount,
            pageCount: pagesRendered,
            success: true,
          }
          const decision = controller.recordSheet(sheetMetrics, globalSheetIndex)
          console.log(`[normal-batch-export] Sheet ${globalSheetIndex + 1}/${totalSheets}: ${Math.round(sheetDurationMs)}ms → ${decision.state} (${decision.reason})`)

          globalSheetIndex++
          processedCards = sheetCardEnd

          if (!decision.continueInBatch) break
        } catch (err) {
          // Sheet rendering failed
          const sheetDurationMs = performance.now() - sheetStartTime
          console.error(`[normal-batch-export] Sheet ${globalSheetIndex + 1} render failed:`, err)

          const sheetMetrics: SheetMetrics = {
            sheetDurationMs,
            studentCount: sheetCardCount,
            pageCount: 0,
            success: false,
          }
          controller.recordSheet(sheetMetrics, globalSheetIndex)

          if (controller.isSheetPermanentlyFailed()) {
            batchAbortReason = `Sheet ${globalSheetIndex + 1} failed ${MAX_SHEET_RETRIES} times: ${err instanceof Error ? err.message : String(err)}`
            batchFailed = true

            if (batchSheetsCompleted > 0) break

            manifest.batches.push({
              filename: batchFilename,
              batchIndex,
              cardStartIndex: batchStartCardIndex,
              cardEndIndex: processedCards,
              sheetStartIndex: batchStartSheetIndex,
              sheetEndIndex: batchStartSheetIndex,
              sheetCount: 0,
              pageCount: 0,
              cardCount: 0,
              outputSizeBytes: 0,
              durationMs: performance.now() - batchStartTime,
              status: 'failed',
            })
            manifest.status = 'failed'
            await writeJSON(batchDir, 'manifest.json', manifest).catch(() => {})
            clearRotatedImageCache()

            return {
              success: false,
              totalPages: totalPagesWritten,
              totalBatches: batchIndex + 1,
              totalCards: cards.length,
              batchFolder: tempFolderName,
              error: batchAbortReason,
            }
          }

          // Sheet failed but can retry — break to start a new batch
          break
        }
      }
    } catch (err) {
      // Fatal error creating/initialising the batch PDF
      console.error(`[normal-batch-export] Batch ${batchIndex + 1} initialisation failed:`, err)
      manifest.batches.push({
        filename: batchFilename,
        batchIndex,
        cardStartIndex: batchStartCardIndex,
        cardEndIndex: processedCards,
        sheetStartIndex: batchStartSheetIndex,
        sheetEndIndex: batchStartSheetIndex,
        sheetCount: 0,
        pageCount: 0,
        cardCount: 0,
        outputSizeBytes: 0,
        durationMs: performance.now() - batchStartTime,
        status: 'failed',
      })
      manifest.status = 'failed'
      await writeJSON(batchDir, 'manifest.json', manifest).catch(() => {})
      clearRotatedImageCache()

      return {
        success: false,
        totalPages: totalPagesWritten,
        totalBatches: batchIndex + 1,
        totalCards: cards.length,
        batchFolder: tempFolderName,
        error: `Batch ${batchIndex + 1} failed: ${err instanceof Error ? err.message : String(err)}`,
      }
    }

    // ── Save completed sheets in this batch ─────────────────────────
    if (batchSheetsCompleted > 0 && pdf) {
      try {
        const batchBlob: Blob = pdf.output('blob')
        const outputSizeBytes = batchBlob.size

        await writeBlob(batchDir, batchFilename, batchBlob)

        const batchDurationMs = performance.now() - batchStartTime

        manifest.batches.push({
          filename: batchFilename,
          batchIndex,
          cardStartIndex: batchStartCardIndex,
          cardEndIndex: processedCards,
          sheetStartIndex: batchStartSheetIndex,
          sheetEndIndex: batchStartSheetIndex + batchSheetsCompleted,
          sheetCount: batchSheetsCompleted,
          pageCount: batchPagesRendered,
          cardCount: batchCardsRendered,
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
          totalStudents: batchCardsRendered,
          totalPages: batchPagesRendered,
          finalState: 'normal',
          memorySnapshot: memSnapshot,
        })

        totalPagesWritten += batchPagesRendered
        batchIndex++
      } catch (err) {
        console.error(`[normal-batch-export] Batch ${batchIndex + 1} write failed:`, err)
        manifest.batches.push({
          filename: batchFilename,
          batchIndex,
          cardStartIndex: batchStartCardIndex,
          cardEndIndex: processedCards,
          sheetStartIndex: batchStartSheetIndex,
          sheetEndIndex: batchStartSheetIndex + batchSheetsCompleted,
          sheetCount: batchSheetsCompleted,
          pageCount: batchPagesRendered,
          cardCount: batchCardsRendered,
          outputSizeBytes: 0,
          durationMs: performance.now() - batchStartTime,
          status: 'failed',
        })
        manifest.status = 'failed'
        await writeJSON(batchDir, 'manifest.json', manifest).catch(() => {})
        clearRotatedImageCache()

        return {
          success: false,
          totalPages: totalPagesWritten,
          totalBatches: batchIndex + 1,
          totalCards: cards.length,
          batchFolder: tempFolderName,
          error: `Failed to write batch ${batchIndex + 1}: ${err instanceof Error ? err.message : String(err)}`,
        }
      }
    }

    // ── Release batch resources ───────────────────────────────────────
    pdf = null

    // If the batch was aborted due to permanent sheet failure, stop
    if (batchFailed) {
      manifest.status = 'failed'
      await writeJSON(batchDir, 'manifest.json', manifest).catch(() => {})
      clearRotatedImageCache()
      return {
        success: false,
        totalPages: totalPagesWritten,
        totalBatches: batchIndex,
        totalCards: cards.length,
        batchFolder: tempFolderName,
        error: batchAbortReason,
      }
    }

    // Check cancellation after batch
    if (isCancelled()) {
      manifest.status = 'cancelled'
      await writeJSON(batchDir, 'manifest.json', manifest).catch(() => {})
      clearRotatedImageCache()
      return {
        success: false,
        totalPages: totalPagesWritten,
        totalBatches: batchIndex,
        totalCards: cards.length,
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
  clearRotatedImageCache()

  return {
    success: true,
    totalPages: totalPagesWritten,
    totalBatches: batchIndex,
    totalCards: cards.length,
    batchFolder: tempFolderName,
  }
}
