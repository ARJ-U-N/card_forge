/**
 * Client-side converters for PDF and TIFF/TIF files.
 * Converts these formats into PNG data URLs suitable for use as static images
 * in the Designer canvas.
 */

// ── PDF conversion ──────────────────────────────────────────────────────

/** Information about a loaded PDF document */
export interface PdfInfo {
  numPages: number
  /** Render a specific page (1-based) to a PNG data URL */
  renderPage: (pageNum: number) => Promise<string>
}

/**
 * Load a PDF file and return page count + per-page renderer.
 * Uses pdfjs-dist (dynamic import to avoid SSR issues).
 */
export async function loadPdf(file: File): Promise<PdfInfo> {
  const pdfjs = await import('pdfjs-dist')

  // Set the worker source to the bundled worker
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const pdfjsVersion = pdfjs.version
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsVersion}/pdf.worker.min.mjs`
  }

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise

  return {
    numPages: pdf.numPages,
    renderPage: async (pageNum: number): Promise<string> => {
      const page = await pdf.getPage(pageNum)
      // Render at 2x scale for print-quality output on ID cards
      const scale = 2
      const viewport = page.getViewport({ scale })

      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height

      await page.render({ canvas, viewport }).promise
      return canvas.toDataURL('image/png')
    },
  }
}

// ── TIFF conversion ─────────────────────────────────────────────────────

/**
 * Convert a TIFF/TIF file into a PNG data URL.
 * Uses utif2 (dynamic import to avoid SSR issues).
 */
export async function convertTiff(file: File): Promise<string> {
  const UTIF = await import('utif2')

  const arrayBuffer = await file.arrayBuffer()
  const ifds = UTIF.decode(arrayBuffer)

  if (ifds.length === 0) {
    throw new Error('Invalid or empty TIFF file')
  }

  // Decode the first image in the TIFF
  UTIF.decodeImage(arrayBuffer, ifds[0])
  const rgba = UTIF.toRGBA8(ifds[0])
  const width = ifds[0].width
  const height = ifds[0].height

  // Render RGBA data onto a canvas
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.createImageData(width, height)
  imageData.data.set(new Uint8Array(rgba))
  ctx.putImageData(imageData, 0, 0)

  return canvas.toDataURL('image/png')
}

// ── Helpers ─────────────────────────────────────────────────────────────

/** Check if a file is a PDF based on its extension */
export function isPdf(file: File): boolean {
  return file.name.toLowerCase().endsWith('.pdf')
}

/** Check if a file is a TIFF/TIF based on its extension */
export function isTiff(file: File): boolean {
  const name = file.name.toLowerCase()
  return name.endsWith('.tiff') || name.endsWith('.tif')
}
