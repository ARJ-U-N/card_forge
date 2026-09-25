/**
 * Print layout engine — calculates card placement on printable pages
 * and generates PDF output using jsPDF.
 */
import type { RenderedCard } from './card-renderer'

// ---------------------------------------------------------------------------
// Configuration types
// ---------------------------------------------------------------------------

export type PaperSize = 'a4' | 'letter' | 'legal'
export type PaperOrientation = 'portrait' | 'landscape'
export type PrintMode = 'front-only' | 'duplex' | 'side-by-side'

export interface PrintConfig {
  paperSize: PaperSize
  orientation: PaperOrientation
  margins: { top: number; bottom: number; left: number; right: number }
  gutter: number
  rows: number
  columns: number
  autoLayout: boolean
  cropMarks: boolean
  cardBorders: boolean
  printMode: PrintMode
}

export const DEFAULT_PRINT_CONFIG: PrintConfig = {
  paperSize: 'a4',
  orientation: 'portrait',
  margins: { top: 10, bottom: 10, left: 10, right: 10 },
  gutter: 3,
  rows: 4,
  columns: 2,
  autoLayout: true,
  cropMarks: true,
  cardBorders: false,
  printMode: 'front-only',
}

// ---------------------------------------------------------------------------
// Paper dimensions (mm)
// ---------------------------------------------------------------------------

const PAPER_DIMS: Record<PaperSize, { w: number; h: number }> = {
  a4: { w: 210, h: 297 },
  letter: { w: 215.9, h: 279.4 },
  legal: { w: 215.9, h: 355.6 },
}

// CR-80 card (mm): 85.6 × 53.98
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
}

export function calculateLayout(config: PrintConfig, cardOrientation: 'horizontal' | 'vertical' = 'horizontal'): PageLayout {
  const paper = PAPER_DIMS[config.paperSize]
  const pageW = config.orientation === 'landscape' ? paper.h : paper.w
  const pageH = config.orientation === 'landscape' ? paper.w : paper.h

  const cardW = cardOrientation === 'vertical' ? CARD_H_MM : CARD_W_MM
  const cardH = cardOrientation === 'vertical' ? CARD_W_MM : CARD_H_MM

  const availW = pageW - config.margins.left - config.margins.right
  const availH = pageH - config.margins.top - config.margins.bottom

  let rows = config.rows
  let cols = config.columns

  if (config.autoLayout) {
    cols = Math.max(1, Math.floor((availW + config.gutter) / (cardW + config.gutter)))
    rows = Math.max(1, Math.floor((availH + config.gutter) / (cardH + config.gutter)))
  }

  // Clamp to fit
  cols = Math.max(1, Math.min(cols, Math.floor((availW + config.gutter) / (cardW + config.gutter))))
  rows = Math.max(1, Math.min(rows, Math.floor((availH + config.gutter) / (cardH + config.gutter))))

  const totalGridW = cols * cardW + (cols - 1) * config.gutter
  const totalGridH = rows * cardH + (rows - 1) * config.gutter

  // Center the grid
  const offsetX = config.margins.left + (availW - totalGridW) / 2
  const offsetY = config.margins.top + (availH - totalGridH) / 2

  const slots: CardSlot[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      slots.push({
        x: offsetX + c * (cardW + config.gutter),
        y: offsetY + r * (cardH + config.gutter),
        w: cardW,
        h: cardH,
      })
    }
  }

  return { pageW, pageH, cardW, cardH, rows, cols, slots, cardsPerPage: rows * cols }
}

// ---------------------------------------------------------------------------
// Page distribution
// ---------------------------------------------------------------------------

export interface PrintPage {
  pageNumber: number
  side: 'front' | 'back'
  cards: { slot: CardSlot; card: RenderedCard }[]
}

export function distributeCards(
  cards: RenderedCard[],
  layout: PageLayout,
  printMode: PrintMode,
): PrintPage[] {
  const pages: PrintPage[] = []
  const { cardsPerPage, slots } = layout

  if (printMode === 'front-only') {
    for (let i = 0; i < cards.length; i += cardsPerPage) {
      const chunk = cards.slice(i, i + cardsPerPage)
      pages.push({
        pageNumber: pages.length + 1,
        side: 'front',
        cards: chunk.map((card, idx) => ({ slot: slots[idx], card })),
      })
    }
  } else if (printMode === 'duplex') {
    // Front pages followed by matching back pages
    for (let i = 0; i < cards.length; i += cardsPerPage) {
      const chunk = cards.slice(i, i + cardsPerPage)
      pages.push({
        pageNumber: pages.length + 1,
        side: 'front',
        cards: chunk.map((card, idx) => ({ slot: slots[idx], card })),
      })
      // Back page — reverse column order for proper duplex alignment
      const backSlots = [...slots].map((slot, idx) => {
        const row = Math.floor(idx / layout.cols)
        const col = idx % layout.cols
        const mirroredCol = layout.cols - 1 - col
        return slots[row * layout.cols + mirroredCol]
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
// PDF Generation
// ---------------------------------------------------------------------------

export async function generatePDF(
  cards: RenderedCard[],
  config: PrintConfig,
  cardOrientation: 'horizontal' | 'vertical',
  onProgress?: (current: number, total: number, status: string) => void,
): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf')

  const layout = calculateLayout(config, cardOrientation)
  const pages = distributeCards(cards, layout, config.printMode)

  const pdf = new jsPDF({
    orientation: config.orientation === 'landscape' ? 'landscape' : 'portrait',
    unit: 'mm',
    format: config.paperSize === 'a4' ? 'a4' : config.paperSize === 'letter' ? 'letter' : 'legal',
  })

  const totalPages = pages.length
  const CROP_LEN = 3 // mm
  const CROP_OFFSET = 1 // mm from card edge

  for (let pi = 0; pi < pages.length; pi++) {
    const page = pages[pi]
    onProgress?.(pi + 1, totalPages, `Rendering page ${pi + 1} of ${totalPages}…`)

    if (pi > 0) pdf.addPage()

    // Draw each card on this page
    for (const { slot, card } of page.cards) {
      const imgData = page.side === 'back' ? card.backDataUrl : card.frontDataUrl

      // Draw card image
      try {
        pdf.addImage(imgData, 'PNG', slot.x, slot.y, slot.w, slot.h)
      } catch {
        // Skip if image fails
      }

      // Card borders
      if (config.cardBorders) {
        pdf.setDrawColor(200, 200, 200)
        pdf.setLineWidth(0.2)
        pdf.rect(slot.x, slot.y, slot.w, slot.h)
      }

      // Crop marks
      if (config.cropMarks) {
        pdf.setDrawColor(0, 0, 0)
        pdf.setLineWidth(0.15)

        // Top-left
        pdf.line(slot.x - CROP_OFFSET - CROP_LEN, slot.y, slot.x - CROP_OFFSET, slot.y)
        pdf.line(slot.x, slot.y - CROP_OFFSET - CROP_LEN, slot.x, slot.y - CROP_OFFSET)

        // Top-right
        pdf.line(slot.x + slot.w + CROP_OFFSET, slot.y, slot.x + slot.w + CROP_OFFSET + CROP_LEN, slot.y)
        pdf.line(slot.x + slot.w, slot.y - CROP_OFFSET - CROP_LEN, slot.x + slot.w, slot.y - CROP_OFFSET)

        // Bottom-left
        pdf.line(slot.x - CROP_OFFSET - CROP_LEN, slot.y + slot.h, slot.x - CROP_OFFSET, slot.y + slot.h)
        pdf.line(slot.x, slot.y + slot.h + CROP_OFFSET, slot.x, slot.y + slot.h + CROP_OFFSET + CROP_LEN)

        // Bottom-right
        pdf.line(slot.x + slot.w + CROP_OFFSET, slot.y + slot.h, slot.x + slot.w + CROP_OFFSET + CROP_LEN, slot.y + slot.h)
        pdf.line(slot.x + slot.w, slot.y + slot.h + CROP_OFFSET, slot.x + slot.w, slot.y + slot.h + CROP_OFFSET + CROP_LEN)
      }
    }

    // Side-by-side mode: draw back cards next to fronts
    if (config.printMode === 'side-by-side') {
      for (const { slot, card } of page.cards) {
        const backX = slot.x + slot.w + config.gutter
        if (backX + slot.w <= layout.pageW - config.margins.right) {
          try {
            pdf.addImage(card.backDataUrl, 'PNG', backX, slot.y, slot.w, slot.h)
          } catch { /* skip */ }

          if (config.cardBorders) {
            pdf.setDrawColor(200, 200, 200)
            pdf.setLineWidth(0.2)
            pdf.rect(backX, slot.y, slot.w, slot.h)
          }
          if (config.cropMarks) {
            pdf.setDrawColor(0, 0, 0)
            pdf.setLineWidth(0.15)
            pdf.line(backX + slot.w + CROP_OFFSET, slot.y, backX + slot.w + CROP_OFFSET + CROP_LEN, slot.y)
            pdf.line(backX + slot.w, slot.y - CROP_OFFSET - CROP_LEN, backX + slot.w, slot.y - CROP_OFFSET)
            pdf.line(backX + slot.w + CROP_OFFSET, slot.y + slot.h, backX + slot.w + CROP_OFFSET + CROP_LEN, slot.y + slot.h)
            pdf.line(backX + slot.w, slot.y + slot.h + CROP_OFFSET, backX + slot.w, slot.y + slot.h + CROP_OFFSET + CROP_LEN)
          }
        }
      }
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
