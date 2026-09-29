/**
 * Print layout engine — calculates card placement on printable pages
 * and generates PDF output using jsPDF.
 */
import type { RenderedCard } from './card-renderer'

// ---------------------------------------------------------------------------
// Configuration types
// ---------------------------------------------------------------------------

export type PaperSize = 'a3' | 'a4' | 'letter' | 'legal'
export type PaperOrientation = 'portrait' | 'landscape'
export type PrintMode = 'front-only' | 'back-only' | 'duplex' | 'side-by-side'
export type LayoutMode = 'automatic' | 'custom' | 'rotated-90'
export type DuplexBackArrangement = 'normal' | 'mirror-h' | 'mirror-v' | 'rotate-180'

export interface SideAdjustment {
  /** X offset in mm (positive = shift right) */
  offsetX: number
  /** Y offset in mm (positive = shift down) */
  offsetY: number
  /** Rotation in degrees around the center of the grid */
  rotation: number
}

export const DEFAULT_SIDE_ADJUSTMENT: SideAdjustment = {
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
}

export interface PrintConfig {
  paperSize: PaperSize
  orientation: PaperOrientation
  margins: { top: number; bottom: number; left: number; right: number }
  /** @deprecated Use gutterH / gutterV instead. Kept for backward compat. */
  gutter?: number
  /** Horizontal gap between cards in the same row (mm) */
  gutterH: number
  /** Vertical gap between rows (mm) */
  gutterV: number
  rows: number
  columns: number
  autoLayout: boolean
  cropMarks: boolean
  cardBorders: boolean
  printMode: PrintMode
  /** Layout mode: automatic, custom grid, or rotated-90 cards */
  layoutMode: LayoutMode
  /** How the back side is arranged for duplex printing */
  duplexBack: DuplexBackArrangement
  /** Fine X/Y/rotation adjustment for front side */
  frontAdjustment: SideAdjustment
  /** Fine X/Y/rotation adjustment for back side */
  backAdjustment: SideAdjustment
}

/** Migrate a config that may have the old single `gutter` field */
export function migratePrintConfig(raw: Partial<PrintConfig> & { gutter?: number }): PrintConfig {
  const base = { ...DEFAULT_PRINT_CONFIG, ...raw }
  // If gutterH/gutterV were not explicitly set, fall back to the old gutter
  if (raw.gutterH === undefined && raw.gutter !== undefined) base.gutterH = raw.gutter
  if (raw.gutterV === undefined && raw.gutter !== undefined) base.gutterV = raw.gutter
  return base
}

export const DEFAULT_PRINT_CONFIG: PrintConfig = {
  paperSize: 'a4',
  orientation: 'portrait',
  margins: { top: 10, bottom: 10, left: 10, right: 10 },
  gutterH: 3,
  gutterV: 3,
  rows: 4,
  columns: 2,
  autoLayout: true,
  cropMarks: true,
  cardBorders: false,
  printMode: 'front-only',
  layoutMode: 'automatic',
  duplexBack: 'mirror-h',
  frontAdjustment: { ...DEFAULT_SIDE_ADJUSTMENT },
  backAdjustment: { ...DEFAULT_SIDE_ADJUSTMENT },
}

// ---------------------------------------------------------------------------
// Paper dimensions (mm)
// ---------------------------------------------------------------------------

const PAPER_DIMS: Record<PaperSize, { w: number; h: number }> = {
  a3: { w: 297, h: 420 },
  a4: { w: 210, h: 297 },
  letter: { w: 215.9, h: 279.4 },
  legal: { w: 215.9, h: 355.6 },
}

// CR-80 card (mm): 85.6 × 53.98 — used as defaults
const CARD_W_MM = 85.6
const CARD_H_MM = 54

// ---------------------------------------------------------------------------
// Layout calculation
// ---------------------------------------------------------------------------

export interface CardSlot {
  x: number // mm from left
  y: number // mm from top
  w: number // card width mm
  h: number // card height mm
  /** Rotation angle in degrees (0 = normal, 90 = rotated clockwise) */
  rotation?: number
}

export interface PageLayout {
  pageW: number
  pageH: number
  cardW: number
  cardH: number
  rows: number
  cols: number
  slots: CardSlot[]
  cardsPerPage: number
  /** Whether card images need to be rotated for this layout */
  rotateCards: boolean
}

export function calculateLayout(
  config: PrintConfig,
  cardOrientation: 'horizontal' | 'vertical' = 'horizontal',
  /** Custom card dimensions in mm. Falls back to CR-80. */
  customCardMm?: { w: number; h: number },
): PageLayout {
  const paper = PAPER_DIMS[config.paperSize]
  const isRotated90 = config.layoutMode === 'rotated-90'

  // For rotated-90 mode, always use portrait paper regardless of the orientation setting
  const effectiveOrientation = isRotated90 ? 'portrait' : config.orientation
  const pageW = effectiveOrientation === 'landscape' ? paper.h : paper.w
  const pageH = effectiveOrientation === 'landscape' ? paper.w : paper.h

  // Use custom card dimensions or fall back to CR-80
  const rawW = customCardMm?.w ?? CARD_W_MM
  const rawH = customCardMm?.h ?? CARD_H_MM

  // Determine base card dimensions from the card's design orientation
  const baseCardW = cardOrientation === 'vertical' ? rawH : rawW
  const baseCardH = cardOrientation === 'vertical' ? rawW : rawH

  // For rotated-90 mode, swap the card dimensions for slot layout
  // (the slot holds the rotated card, so W↔H are swapped)
  const cardW = isRotated90 ? baseCardH : baseCardW
  const cardH = isRotated90 ? baseCardW : baseCardH

  const availW = pageW - config.margins.left - config.margins.right
  const availH = pageH - config.margins.top - config.margins.bottom

  let rows = config.rows
  let cols = config.columns

  const gH = config.gutterH
  const gV = config.gutterV

  const useAutoLayout = isRotated90 ? true : config.autoLayout

  if (useAutoLayout) {
    // Calculate how many fixed-size cards fit in the available space.
    // Card dimensions are NEVER modified — only rows/cols change.
    cols = Math.max(1, Math.floor((availW + gH) / (cardW + gH)))
    rows = Math.max(1, Math.floor((availH + gV) / (cardH + gV)))
  }

  // Clamp to fit (for custom mode where user may set too many rows/cols)
  cols = Math.max(1, Math.min(cols, Math.floor((availW + gH) / (cardW + gH))))
  rows = Math.max(1, Math.min(rows, Math.floor((availH + gV) / (cardH + gV))))

  const totalGridW = cols * cardW + (cols - 1) * gH
  const totalGridH = rows * cardH + (rows - 1) * gV

  // Center the grid
  const offsetX = config.margins.left + (availW - totalGridW) / 2
  const offsetY = config.margins.top + (availH - totalGridH) / 2

  const slots: CardSlot[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      slots.push({
        x: offsetX + c * (cardW + gH),
        y: offsetY + r * (cardH + gV),
        w: cardW,
        h: cardH,
        rotation: isRotated90 ? 90 : 0,
      })
    }
  }

  return { pageW, pageH, cardW, cardH, rows, cols, slots, cardsPerPage: rows * cols, rotateCards: isRotated90 }
}

// ---------------------------------------------------------------------------
// Page distribution
// ---------------------------------------------------------------------------

export interface PrintPage {
  pageNumber: number
  side: 'front' | 'back'
  cards: { slot: CardSlot; card: RenderedCard }[]
}

/**
 * Compute the back-side slot mapping for duplex based on the arrangement mode.
 * Each arrangement transforms the slot index so that cards on the back page
 * land in the physically correct position after the paper is flipped.
 */
function computeBackSlots(
  slots: CardSlot[],
  rows: number,
  cols: number,
  arrangement: DuplexBackArrangement,
): CardSlot[] {
  return slots.map((_slot, idx) => {
    const row = Math.floor(idx / cols)
    const col = idx % cols
    switch (arrangement) {
      case 'normal':
        // Same order as front — no transformation
        return slots[idx]
      case 'mirror-h': {
        // Columns reversed, rows same
        const mirroredCol = cols - 1 - col
        return slots[row * cols + mirroredCol]
      }
      case 'mirror-v': {
        // Rows reversed, columns same
        const mirroredRow = rows - 1 - row
        return slots[mirroredRow * cols + col]
      }
      case 'rotate-180': {
        // Both rows and columns reversed (180° rotation of grid)
        const mirroredRow = rows - 1 - row
        const mirroredCol = cols - 1 - col
        return slots[mirroredRow * cols + mirroredCol]
      }
      default:
        return slots[idx]
    }
  })
}

export function distributeCards(
  cards: RenderedCard[],
  layout: PageLayout,
  printMode: PrintMode,
  orientation: PaperOrientation = 'portrait',
  duplexBack: DuplexBackArrangement = 'mirror-h',
): PrintPage[] {
  const pages: PrintPage[] = []
  const { cardsPerPage, slots } = layout

  if (printMode === 'front-only' || printMode === 'back-only') {
    const side = printMode === 'back-only' ? 'back' : 'front'
    for (let i = 0; i < cards.length; i += cardsPerPage) {
      const chunk = cards.slice(i, i + cardsPerPage)
      pages.push({
        pageNumber: pages.length + 1,
        side,
        cards: chunk.map((card, idx) => ({ slot: slots[idx], card })),
      })
    }
  } else if (printMode === 'duplex') {
    // Front pages followed by matching back pages
    const backSlots = computeBackSlots(slots, layout.rows, layout.cols, duplexBack)
    for (let i = 0; i < cards.length; i += cardsPerPage) {
      const chunk = cards.slice(i, i + cardsPerPage)
      pages.push({
        pageNumber: pages.length + 1,
        side: 'front',
        cards: chunk.map((card, idx) => ({ slot: slots[idx], card })),
      })
      pages.push({
        pageNumber: pages.length + 1,
        side: 'back',
        cards: chunk.map((card, idx) => ({ slot: backSlots[idx], card })),
      })
    }
  } else {
    // side-by-side: front and back next to each other
    // Each card takes 2 slots horizontally
    const pairsPerPage = Math.floor(cardsPerPage / 2)
    const effectivePerPage = Math.max(1, pairsPerPage)

    for (let i = 0; i < cards.length; i += effectivePerPage) {
      const chunk = cards.slice(i, i + effectivePerPage)
      pages.push({
        pageNumber: pages.length + 1,
        side: 'front', // mixed
        cards: chunk.map((card, idx) => ({ slot: slots[idx * 2] ?? slots[0], card })),
      })
    }
  }

  return pages
}

// ---------------------------------------------------------------------------
// Rotate image data 90° clockwise on a canvas, returning a data URL.
// Used for the rotated-90 layout mode. Does NOT modify the original card.
// ---------------------------------------------------------------------------

const rotatedImageCache = new Map<string, string>()

function rotateImageData90(dataUrl: string): Promise<string> {
  const cached = rotatedImageCache.get(dataUrl)
  if (cached) return Promise.resolve(cached)

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      // Swap dimensions for 90° rotation
      canvas.width = img.height
      canvas.height = img.width
      const ctx = canvas.getContext('2d')!
      // Translate to center, rotate 90° clockwise, draw offset
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

// ---------------------------------------------------------------------------
// PDF Generation
// ---------------------------------------------------------------------------

export async function generatePDF(
  cards: RenderedCard[],
  config: PrintConfig,
  cardOrientation: 'horizontal' | 'vertical',
  onProgress?: (current: number, total: number, status: string) => void,
  customCardMm?: { w: number; h: number },
): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf')

  const layout = calculateLayout(config, cardOrientation, customCardMm)
  const pages = distributeCards(cards, layout, config.printMode, config.orientation, config.duplexBack)

  // For rotated-90 mode, always use portrait regardless of config.orientation
  const effectivePdfOrientation = layout.rotateCards ? 'portrait' : config.orientation

  const pdf = new jsPDF({
    orientation: effectivePdfOrientation === 'landscape' ? 'landscape' : 'portrait',
    unit: 'mm',
    format: config.paperSize === 'a4' ? 'a4' : config.paperSize === 'letter' ? 'letter' : 'legal',
  })

  const totalPages = pages.length
  const CROP_LEN = 3 // mm
  const CROP_OFFSET = 1 // mm from card edge

  // Pre-rotate images if needed (only done once per unique data URL)
  if (layout.rotateCards) {
    onProgress?.(0, totalPages, 'Preparing rotated card images…')
    const uniqueUrls = new Set<string>()
    for (const card of cards) {
      uniqueUrls.add(card.frontDataUrl)
      uniqueUrls.add(card.backDataUrl)
    }
    await Promise.all(Array.from(uniqueUrls).map((url) => rotateImageData90(url)))
  }

  for (let pi = 0; pi < pages.length; pi++) {
    const page = pages[pi]
    onProgress?.(pi + 1, totalPages, `Rendering page ${pi + 1} of ${totalPages}…`)

    if (pi > 0) pdf.addPage()

    // Apply side adjustment (offset + rotation) for this page
    const adj = page.side === 'back' ? config.backAdjustment : config.frontAdjustment
    const hasAdj = adj.offsetX !== 0 || adj.offsetY !== 0 || adj.rotation !== 0
    if (hasAdj) {
      // Save the current graphics state
      ;(pdf as any).saveGraphicsState()
      // Apply translation
      if (adj.offsetX !== 0 || adj.offsetY !== 0) {
        // jsPDF doesn't have a direct translate; we offset all coordinates below
      }
      // Apply rotation around page center
      if (adj.rotation !== 0) {
        const cx = layout.pageW / 2
        const cy = layout.pageH / 2
        // Use internal matrix transform for rotation around center
        const rad = (adj.rotation * Math.PI) / 180
        const cos = Math.cos(rad)
        const sin = Math.sin(rad)
        // Translate to center, rotate, translate back
        ;(pdf as any).setCurrentTransformationMatrix(
          (pdf as any).Matrix(cos, sin, -sin, cos, cx - cx * cos + cy * sin, cy - cx * sin - cy * cos)
        )
      }
    }

    // Draw each card on this page
    for (const { slot, card } of page.cards) {
      let imgData = page.side === 'back' ? card.backDataUrl : card.frontDataUrl

      // For rotated-90 mode, use the pre-rotated image
      if (layout.rotateCards) {
        imgData = rotatedImageCache.get(imgData) ?? imgData
      }

      // Apply X/Y offset from side adjustment
      const drawX = slot.x + adj.offsetX
      const drawY = slot.y + adj.offsetY

      // Draw card image
      try {
        pdf.addImage(imgData, 'PNG', drawX, drawY, slot.w, slot.h)
      } catch {
        // Skip if image fails
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

        // Top-left
        pdf.line(drawX - CROP_OFFSET - CROP_LEN, drawY, drawX - CROP_OFFSET, drawY)
        pdf.line(drawX, drawY - CROP_OFFSET - CROP_LEN, drawX, drawY - CROP_OFFSET)

        // Top-right
        pdf.line(drawX + slot.w + CROP_OFFSET, drawY, drawX + slot.w + CROP_OFFSET + CROP_LEN, drawY)
        pdf.line(drawX + slot.w, drawY - CROP_OFFSET - CROP_LEN, drawX + slot.w, drawY - CROP_OFFSET)

        // Bottom-left
        pdf.line(drawX - CROP_OFFSET - CROP_LEN, drawY + slot.h, drawX - CROP_OFFSET, drawY + slot.h)
        pdf.line(drawX, drawY + slot.h + CROP_OFFSET, drawX, drawY + slot.h + CROP_OFFSET + CROP_LEN)

        // Bottom-right
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

    // Restore graphics state if we applied adjustments
    if (hasAdj && adj.rotation !== 0) {
      ;(pdf as any).restoreGraphicsState()
    }

    // Yield to main thread
    await new Promise((r) => setTimeout(r, 0))
  }

  onProgress?.(totalPages, totalPages, 'Finalizing PDF…')
  return pdf.output('blob')
}

// ---------------------------------------------------------------------------
// Bulk image export
// ---------------------------------------------------------------------------

export function downloadCardAsFormat(
  card: RenderedCard,
  side: 'front' | 'back',
  format: 'png' | 'jpeg' = 'png',
) {
  const dataUrl = side === 'front' ? card.frontDataUrl : card.backDataUrl
  let finalUrl = dataUrl

  if (format === 'jpeg' && dataUrl.startsWith('data:image/png')) {
    // Convert PNG to JPEG via canvas
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      finalUrl = canvas.toDataURL('image/jpeg', 0.92)
      triggerDownload(finalUrl, card.memberName, side, format)
    }
    img.src = dataUrl
    return
  }

  triggerDownload(finalUrl, card.memberName, side, format)
}

function triggerDownload(url: string, name: string, side: string, format: string) {
  const link = document.createElement('a')
  link.download = `${name.replace(/\s+/g, '_')}_${side}.${format}`
  link.href = url
  link.click()
}

export async function bulkExportImages(
  cards: RenderedCard[],
  format: 'png' | 'jpeg',
  sides: 'front' | 'back' | 'both',
  onProgress?: (current: number, total: number) => void,
) {
  const total = cards.length * (sides === 'both' ? 2 : 1)
  let count = 0

  for (const card of cards) {
    if (sides === 'front' || sides === 'both') {
      downloadCardAsFormat(card, 'front', format)
      count++
      onProgress?.(count, total)
      await new Promise((r) => setTimeout(r, 300))
    }
    if (sides === 'back' || sides === 'both') {
      downloadCardAsFormat(card, 'back', format)
      count++
      onProgress?.(count, total)
      await new Promise((r) => setTimeout(r, 300))
    }
  }
}
