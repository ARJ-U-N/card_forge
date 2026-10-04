/**
 * Vector PDF Renderer — renders card elements individually as vector objects
 * in the PDF instead of flattening each card into a single raster image.
 *
 * Text → vector PDF text
 * Shapes → vector PDF paths/primitives
 * QR codes → vector rectangles for dark modules
 * Code128 barcodes → vector bars
 * Images → raster image objects (not flattened with the card)
 *
 * Reuses existing print-layout slot calculations for page positioning.
 */

import type {
  CanvasElement,
  CardConfiguration,
  CardDocument,
  Design,
  Member,
} from '@/lib/models/types'
import {
  calculateLayout,
  distributeCards,
  type PrintConfig,
  type CardSlot,
  type PageLayout,
  type PrintPage,
  type LayoutMode,
} from '@/lib/print-layout'
import type { RenderedCard } from '@/lib/card-renderer'

// ---------------------------------------------------------------------------
// Coordinate conversion
// ---------------------------------------------------------------------------

// The Designer uses pixels based on CR-80: 324px / 85.6mm ≈ 3.785 px/mm
const DEFAULT_CARD_W_PX = 324
const DEFAULT_CARD_H_PX = 204
const PX_PER_MM = DEFAULT_CARD_W_PX / 85.6

/**
 * Convert Designer pixel coordinates to physical mm, given the card's mm dimensions
 * and its pixel canvas size.
 */
function pxToMm(pxValue: number, cardPxDim: number, cardMmDim: number): number {
  return (pxValue / cardPxDim) * cardMmDim
}

/**
 * Derive canvas pixel dimensions from card config (mirrors card-renderer logic)
 */
function cardPixelSize(config: CardConfiguration): { w: number; h: number } {
  const wmm = config.cardWidthMm ?? 85.6
  const hmm = config.cardHeightMm ?? 54
  return {
    w: Math.round(wmm * PX_PER_MM),
    h: Math.round(hmm * PX_PER_MM),
  }
}

// ---------------------------------------------------------------------------
// Dynamic text/image resolution (mirrors card-renderer.ts logic)
// ---------------------------------------------------------------------------

function resolveDynamicText(member: Member, fieldName: string): string {
  const custom = member.customFields?.[fieldName]
  if (custom) return custom
  switch (fieldName) {
    case 'fullName': return `${member.firstName} ${member.lastName}`.trim()
    case 'firstName': return member.firstName
    case 'lastName': return member.lastName
    case 'dateOfBirth': return member.dateOfBirth
    case 'title': return member.title
    case 'gender': return member.gender
    case 'employeeId': return member.employeeId
    case 'idNumber': return member.idNumber
    case 'parentPhone': return member.parentPhone
    case 'hireDate': return member.hireDate
    case 'branch': return member.branch
    case 'department': return member.department
    case 'expireDate': return member.expireDate
    case 'roomId': return member.roomId
    default: return member.customFields?.[fieldName] ?? `{${fieldName}}`
  }
}

function resolveDynamicImageSrc(member: Member, fieldName: string): string {
  switch (fieldName) {
    case 'profileImage': return member.profileImage
    case 'signature': return member.signature
    case 'divisionLogo': return member.divisionLogo
    case 'fingerprint': return member.fingerprint
    default: return member.customFields?.[fieldName] ?? ''
  }
}

// ---------------------------------------------------------------------------
// Image loader with cache
// ---------------------------------------------------------------------------

const _imgCache = new Map<string, string | null>()

async function loadImageAsDataUrl(src: string): Promise<string | null> {
  if (!src) return null
  if (_imgCache.has(src)) return _imgCache.get(src) ?? null

  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        const dataUrl = canvas.toDataURL('image/png')
        _imgCache.set(src, dataUrl)
        resolve(dataUrl)
      } catch {
        _imgCache.set(src, null)
        resolve(null)
      }
    }
    img.onerror = () => {
      _imgCache.set(src, null)
      resolve(null)
    }
    img.src = src
  })
}

// ---------------------------------------------------------------------------
// QR Code vector generation
// ---------------------------------------------------------------------------

interface QRMatrix {
  modules: { data: Uint8Array; size: number }
}

async function getQRMatrix(text: string): Promise<QRMatrix | null> {
  try {
    const QRCode = await import('qrcode')
    const qr = QRCode.create(text || 'N/A', { errorCorrectionLevel: 'M' })
    return qr as unknown as QRMatrix
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Code128 barcode encoding
// ---------------------------------------------------------------------------

interface BarcodeBar {
  x: number
  width: number
  height: number
}

async function getCode128Bars(
  text: string,
  totalWidth: number,
  totalHeight: number,
): Promise<BarcodeBar[]> {
  try {
    const JsBarcode = await import('jsbarcode')
    // Render to a temporary canvas to extract encoding
    const canvas = document.createElement('canvas')
    JsBarcode.default(canvas, text || '0000', {
      format: 'CODE128',
      width: 1,
      height: totalHeight,
      displayValue: false,
      margin: 0,
    })

    // Extract bar data from canvas pixel analysis
    const ctx = canvas.getContext('2d')!
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const bars: BarcodeBar[] = []
    let inBar = false
    let barStart = 0

    for (let x = 0; x < canvas.width; x++) {
      // Check if pixel column is dark (black bar)
      const idx = x * 4
      const isDark = imageData.data[idx] < 128
      if (isDark && !inBar) {
        inBar = true
        barStart = x
      } else if (!isDark && inBar) {
        inBar = false
        // Scale x positions to totalWidth
        const scaledX = (barStart / canvas.width) * totalWidth
        const scaledW = ((x - barStart) / canvas.width) * totalWidth
        bars.push({ x: scaledX, width: scaledW, height: totalHeight })
      }
    }
    // Handle bar at end
    if (inBar) {
      const scaledX = (barStart / canvas.width) * totalWidth
      const scaledW = ((canvas.width - barStart) / canvas.width) * totalWidth
      bars.push({ x: scaledX, width: scaledW, height: totalHeight })
    }

    return bars
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Font embedding helpers
// ---------------------------------------------------------------------------

/** Map of fontFamily name → ArrayBuffer (TTF data) already registered in jsPDF */
const _registeredFonts = new Set<string>()

/**
 * Attempt to convert a data URL font to a format jsPDF can embed.
 * jsPDF supports TTF/OTF via addFileToVFS + addFont.
 * WOFF/WOFF2 require decompression and cannot be directly embedded.
 */
async function registerCustomFont(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdf: any,
  fontFamily: string,
  fontData: string,
): Promise<boolean> {
  if (!fontData || !fontFamily) return false
  if (_registeredFonts.has(fontFamily)) return true

  try {
    // fontData is a data URL like "data:font/ttf;base64,..." or "data:application/x-font-ttf;base64,..."
    const mimeMatch = fontData.match(/^data:([^;]+);base64,(.+)$/)
    if (!mimeMatch) return false

    const mime = mimeMatch[1].toLowerCase()
    const base64 = mimeMatch[2]

    // Check if format is supported for embedding
    if (
      mime.includes('woff2') ||
      mime.includes('woff') && !mime.includes('opentype')
    ) {
      // WOFF/WOFF2 cannot be directly embedded in jsPDF
      // They need decompression to TTF first, which is complex
      // Report limitation — will fall back to closest standard font
      console.warn(
        `[VectorPDF] Font "${fontFamily}" is ${mime} format — cannot embed directly. Using closest standard font.`,
      )
      return false
    }

    // TTF and OTF can be embedded
    const fileName = `${fontFamily.replace(/[^a-zA-Z0-9]/g, '_')}.ttf`
    pdf.addFileToVFS(fileName, base64)
    pdf.addFont(fileName, fontFamily, 'normal')
    _registeredFonts.add(fontFamily)
    return true
  } catch (err) {
    console.warn(`[VectorPDF] Failed to register font "${fontFamily}":`, err)
    return false
  }
}

// ---------------------------------------------------------------------------
// Polygon path helpers for jsPDF
// ---------------------------------------------------------------------------

function polygonPoints(
  cx: number, cy: number, rx: number, ry: number, sides: number,
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = []
  const angleOffset = -Math.PI / 2
  for (let i = 0; i < sides; i++) {
    const angle = angleOffset + (2 * Math.PI * i) / sides
    pts.push({
      x: cx + rx * Math.cos(angle),
      y: cy + ry * Math.sin(angle),
    })
  }
  return pts
}

function shapeSides(shape: string): number | null {
  const map: Record<string, number> = {
    pentagon: 5, hexagon: 6, heptagon: 7, octagon: 8,
    nonagon: 9, decagon: 10,
  }
  return map[shape] ?? null
}

// ---------------------------------------------------------------------------
// Core vector card renderer
// ---------------------------------------------------------------------------

/**
 * Render a single card's elements as vector objects into the jsPDF at a given
 * position (slotX, slotY) in mm.
 */
async function renderCardVectorAtSlot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdf: any,
  cardDoc: CardDocument,
  config: CardConfiguration,
  member: Member,
  slotX: number,
  slotY: number,
  slotW: number,
  slotH: number,
  isRotated90: boolean,
) {
  const { w: baseW, h: baseH } = cardPixelSize(config)
  const isVertical = config.orientation === 'vertical'
  const cardPxW = isVertical ? baseH : baseW
  const cardPxH = isVertical ? baseW : baseH

  // Physical card mm dimensions (NOT slot dims, which may be swapped for rotated-90)
  const cardMmW = isVertical
    ? (config.cardHeightMm ?? 54)
    : (config.cardWidthMm ?? 85.6)
  const cardMmH = isVertical
    ? (config.cardWidthMm ?? 85.6)
    : (config.cardHeightMm ?? 54)

  // Save graphics state for card clipping
  pdf.saveGraphicsState()

  if (isRotated90) {
    // For rotated-90: the slot dimensions are swapped (slotW = cardMmH, slotH = cardMmW)
    // because calculateLayout() swaps card W↔H for rotated slots.
    //
    // Strategy: apply a 90° clockwise rotation around the slot center FIRST,
    // then clip and draw in the rotated coordinate space. This ensures the
    // clip region and content share the same coordinate system.
    //
    // The unrotated card rect (cardMmW × cardMmH) is centered in the slot;
    // after the CTM rotation this maps to exactly fill the slot (slotW × slotH).

    const cx = slotX + slotW / 2
    const cy = slotY + slotH / 2
    const rad = (90 * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    // Rotate 90° clockwise around slot center
    pdf.setCurrentTransformationMatrix(
      pdf.Matrix(cos, sin, -sin, cos, cx - cx * cos + cy * sin, cy - cx * sin - cy * cos),
    )

    // Now clip in the ROTATED coordinate space (card's native rect)
    const rOriginX = cx - cardMmW / 2
    const rOriginY = cy - cardMmH / 2
    clipRect(pdf, rOriginX, rOriginY, cardMmW, cardMmH)
  } else {
    // Normal card clipping at slot position
    clipRect(pdf, slotX, slotY, slotW, slotH)
  }

  // Determine the origin where card content is drawn
  // For rotated-90: the card rect is centered in the slot in the rotated
  // coordinate space. Both clip and content use this same origin.
  const originX = isRotated90 ? slotX + slotW / 2 - cardMmW / 2 : slotX
  const originY = isRotated90 ? slotY + slotH / 2 - cardMmH / 2 : slotY

  // Draw background
  const bg = cardDoc.background || config.frontBackground || '#ffffff'
  if (bg.startsWith('linear-gradient')) {
    // Gradient backgrounds must be rasterized as they can't be easily represented as vector
    await drawGradientBackground(pdf, bg, originX, originY, cardMmW, cardMmH, cardPxW, cardPxH)
  } else {
    const rgb = parseColor(bg)
    pdf.setFillColor(rgb.r, rgb.g, rgb.b)
    pdf.rect(originX, originY, cardMmW, cardMmH, 'F')
  }

  // Sort elements by z-index
  const sorted = [...cardDoc.elements].sort((a, b) => a.zIndex - b.zIndex)

  for (const el of sorted) {
    if (!el.visible) continue

    // Convert element pixel coords to mm
    const elXmm = pxToMm(el.x, cardPxW, cardMmW) + originX
    const elYmm = pxToMm(el.y, cardPxH, cardMmH) + originY
    const elWmm = pxToMm(el.width, cardPxW, cardMmW)
    const elHmm = pxToMm(el.height, cardPxH, cardMmH)

    const opacity = (el.props.opacity as number) ?? 1
    if (opacity < 1) {
      pdf.saveGraphicsState()
      pdf.setGState(pdf.GState({ opacity }))
    }

    // Handle element rotation
    const hasRotation = el.rotation && el.rotation !== 0
    if (hasRotation) {
      pdf.saveGraphicsState()
      const cx = elXmm + elWmm / 2
      const cy = elYmm + elHmm / 2
      const rad = (el.rotation * Math.PI) / 180
      const cos = Math.cos(rad)
      const sin = Math.sin(rad)
      pdf.setCurrentTransformationMatrix(
        pdf.Matrix(cos, sin, -sin, cos, cx - cx * cos + cy * sin, cy - cx * sin - cy * cos),
      )
    }

    switch (el.type) {
      case 'text':
        await renderVectorText(pdf, el, elXmm, elYmm, elWmm, elHmm, cardPxW, cardMmW)
        break
      case 'field':
        await renderVectorField(pdf, el, member, elXmm, elYmm, elWmm, elHmm, cardPxW, cardMmW)
        break
      case 'image':
        await renderVectorImage(pdf, el, member, elXmm, elYmm, elWmm, elHmm, cardPxW, cardPxH, cardMmW, cardMmH)
        break
      case 'shape':
        renderVectorShape(pdf, el, elXmm, elYmm, elWmm, elHmm)
        break
    }

    if (hasRotation) {
      pdf.restoreGraphicsState()
    }
    if (opacity < 1) {
      pdf.restoreGraphicsState()
    }
  }

  // Restore from card clipping
  pdf.restoreGraphicsState()
}

// ---------------------------------------------------------------------------
// Clipping helper
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function clipRect(pdf: any, x: number, y: number, w: number, h: number) {
  // Use internal PDF operators for clipping rectangle
  // jsPDF's rect with 'clip' mode isn't always available, so use raw PDF ops
  pdf.rect(x, y, w, h, null)
  // Apply clip using internal method
  const pdfInternal = pdf.internal
  if (pdfInternal && typeof pdfInternal.write === 'function') {
    pdfInternal.write('W n')
  }
}

// ---------------------------------------------------------------------------
// Color parsing
// ---------------------------------------------------------------------------

function parseColor(color: string): { r: number; g: number; b: number } {
  if (!color) return { r: 255, g: 255, b: 255 }

  // Handle hex colors
  if (color.startsWith('#')) {
    let hex = color.slice(1)
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
    if (hex.length === 8) hex = hex.slice(0, 6) // strip alpha
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    }
  }

  // Handle rgb/rgba
  const rgbMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1]),
      g: parseInt(rgbMatch[2]),
      b: parseInt(rgbMatch[3]),
    }
  }

  // Named colors fallback
  const named: Record<string, { r: number; g: number; b: number }> = {
    transparent: { r: 255, g: 255, b: 255 },
    white: { r: 255, g: 255, b: 255 },
    black: { r: 0, g: 0, b: 0 },
    red: { r: 255, g: 0, b: 0 },
    green: { r: 0, g: 128, b: 0 },
    blue: { r: 0, g: 0, b: 255 },
  }
  return named[color.toLowerCase()] ?? { r: 0, g: 0, b: 0 }
}

// ---------------------------------------------------------------------------
// Gradient background fallback (rasterize only the gradient)
// ---------------------------------------------------------------------------

async function drawGradientBackground(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdf: any,
  bg: string,
  x: number,
  y: number,
  wMm: number,
  hMm: number,
  cardPxW: number,
  cardPxH: number,
) {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = cardPxW
    canvas.height = cardPxH
    const ctx = canvas.getContext('2d')!

    const match = bg.match(/linear-gradient\((\d+)deg,\s*([^,]+),\s*([^)]+)\)/)
    if (match) {
      const angle = parseInt(match[1]) * (Math.PI / 180)
      const x1 = cardPxW / 2 + Math.cos(angle + Math.PI) * cardPxW / 2
      const y1 = cardPxH / 2 + Math.sin(angle + Math.PI) * cardPxH / 2
      const x2 = cardPxW / 2 + Math.cos(angle) * cardPxW / 2
      const y2 = cardPxH / 2 + Math.sin(angle) * cardPxH / 2
      const grad = ctx.createLinearGradient(x1, y1, x2, y2)
      const stops = bg.match(/#[0-9a-fA-F]{3,8}|rgb[a]?\([^)]+\)/g)
      if (stops) {
        stops.forEach((s, i) => grad.addColorStop(i / Math.max(1, stops.length - 1), s.trim()))
      }
      ctx.fillStyle = grad
    } else {
      ctx.fillStyle = '#ffffff'
    }
    ctx.fillRect(0, 0, cardPxW, cardPxH)

    const dataUrl = canvas.toDataURL('image/png')
    pdf.addImage(dataUrl, 'PNG', x, y, wMm, hMm)
  } catch {
    // Fallback to white
    pdf.setFillColor(255, 255, 255)
    pdf.rect(x, y, wMm, hMm, 'F')
  }
}

// ---------------------------------------------------------------------------
// Vector text renderer
// ---------------------------------------------------------------------------

function mapFontToJsPDF(fontFamily: string): string {
  // jsPDF built-in fonts
  const lower = fontFamily.toLowerCase()
  if (lower.includes('courier') || lower.includes('mono')) return 'courier'
  if (lower.includes('times') || lower.includes('serif') && !lower.includes('sans')) return 'times'
  // Default to helvetica (closest to Inter/sans-serif)
  return 'helvetica'
}

async function renderVectorText(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdf: any,
  el: CanvasElement,
  xMm: number,
  yMm: number,
  wMm: number,
  _hMm: number,
  cardPxW: number,
  cardMmW: number,
) {
  const text = (el.props.text as string) ?? ''
  if (!text) return

  const fontSize = (el.props.fontSize as number) ?? 14
  const fontWeight = (el.props.fontWeight as string) ?? 'normal'
  const fontStyle = (el.props.fontStyle as string) ?? 'normal'
  const fontFamily = (el.props.fontFamily as string) ?? 'Inter, sans-serif'
  const color = (el.props.color as string) ?? '#000'
  const textAlign = (el.props.textAlign as string) ?? 'left'
  const customFontData = (el.props.customFontData as string) ?? ''

  // Convert font size from px to mm (relative to card dimensions)
  const fontSizeMm = pxToMm(fontSize, cardPxW, cardMmW)
  // jsPDF uses points (1 pt = 0.352778 mm)
  const fontSizePt = fontSizeMm / 0.352778

  // Try to register custom font
  let usedFontFamily = mapFontToJsPDF(fontFamily)
  if (customFontData) {
    const registered = await registerCustomFont(pdf, fontFamily, customFontData)
    if (registered) usedFontFamily = fontFamily
  }

  // Determine jsPDF font style
  let jsPDFStyle = 'normal'
  if (fontWeight === 'bold' && fontStyle === 'italic') jsPDFStyle = 'bolditalic'
  else if (fontWeight === 'bold') jsPDFStyle = 'bold'
  else if (fontStyle === 'italic') jsPDFStyle = 'italic'

  const rgb = parseColor(color)
  pdf.setTextColor(rgb.r, rgb.g, rgb.b)
  pdf.setFont(usedFontFamily, jsPDFStyle)
  pdf.setFontSize(fontSizePt)

  // Handle multiline text
  const lines = text.split('\n')
  const lineHeightMm = fontSizeMm * 1.3

  // Determine text X based on alignment
  let textX = xMm
  let align: 'left' | 'center' | 'right' = 'left'
  if (textAlign === 'center') {
    textX = xMm + wMm / 2
    align = 'center'
  } else if (textAlign === 'right') {
    textX = xMm + wMm
    align = 'right'
  }

  lines.forEach((line, i) => {
    const lineY = yMm + fontSizeMm + i * lineHeightMm
    pdf.text(line, textX, lineY, {
      align,
      maxWidth: wMm,
    })
  })
}

// ---------------------------------------------------------------------------
// Vector field (dynamic text) renderer
// ---------------------------------------------------------------------------

async function renderVectorField(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdf: any,
  el: CanvasElement,
  member: Member,
  xMm: number,
  yMm: number,
  wMm: number,
  hMm: number,
  cardPxW: number,
  cardMmW: number,
) {
  const fieldName = (el.props.fieldName as string) ?? ''
  const label = (el.props.label as string) ?? ''
  const resolvedText = label + resolveDynamicText(member, fieldName)

  // Create a synthetic text element with the resolved text
  const syntheticEl: CanvasElement = {
    ...el,
    props: {
      ...el.props,
      text: resolvedText,
    },
  }

  await renderVectorText(pdf, syntheticEl, xMm, yMm, wMm, hMm, cardPxW, cardMmW)
}

// ---------------------------------------------------------------------------
// Vector image renderer (images remain raster, but with vector clipping/borders)
// ---------------------------------------------------------------------------

async function renderVectorImage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdf: any,
  el: CanvasElement,
  member: Member,
  xMm: number,
  yMm: number,
  wMm: number,
  hMm: number,
  cardPxW: number,
  cardPxH: number,
  cardMmW: number,
  cardMmH: number,
) {
  const borderSize = (el.props.borderSize as number) ?? 0
  const borderColor = (el.props.borderColor as string) ?? '#000'

  // Independent corner radii
  const legacyR = (el.props.borderRadius as number) ?? 0
  const rTL = (el.props.borderRadiusTL as number) ?? legacyR
  const rTR = (el.props.borderRadiusTR as number) ?? legacyR
  const rBR = (el.props.borderRadiusBR as number) ?? legacyR
  const rBL = (el.props.borderRadiusBL as number) ?? legacyR
  const hasRadius = rTL > 0 || rTR > 0 || rBR > 0 || rBL > 0

  // Shape support
  const imageShape = (el.props.imageShape as string) ?? 'rectangle'
  const sides = shapeSides(imageShape)
  const isCircle = imageShape === 'circle'
  const isOval = imageShape === 'oval'
  const isPolygon = sides !== null

  // Check if QR code
  if (el.props.qrCode) {
    const fieldName = (el.props.fieldName as string) ?? 'employeeId'
    const qrText = resolveDynamicText(member, fieldName)
    await renderVectorQR(pdf, qrText, xMm, yMm, wMm, hMm)
    return
  }

  // Check if barcode
  if (el.props.barcode) {
    const fieldName = (el.props.fieldName as string) ?? 'employeeId'
    const bcText = resolveDynamicText(member, fieldName)
    await renderVectorBarcode(pdf, bcText, xMm, yMm, wMm, hMm)
    return
  }

  // Resolve image source
  let imgSrc = ''
  if (el.props.dynamic) {
    const fieldName = (el.props.fieldName as string) ?? 'profileImage'
    imgSrc = resolveDynamicImageSrc(member, fieldName)
  } else {
    imgSrc = (el.props.src as string) ?? ''
  }

  if (!imgSrc) return

  // Load the image
  const dataUrl = await loadImageAsDataUrl(imgSrc)
  if (!dataUrl) return

  // Apply clipping for non-rectangular shapes
  const needsClip = isCircle || isOval || isPolygon || hasRadius
  if (needsClip) {
    pdf.saveGraphicsState()

    if (isCircle || isOval) {
      // Ellipse clip
      drawEllipsePath(pdf, xMm + wMm / 2, yMm + hMm / 2, wMm / 2, hMm / 2)
      const pdfInternal = pdf.internal
      if (pdfInternal && typeof pdfInternal.write === 'function') {
        pdfInternal.write('W n')
      }
    } else if (isPolygon) {
      // Polygon clip
      drawPolygonPath(pdf, xMm + wMm / 2, yMm + hMm / 2, wMm / 2, hMm / 2, sides!)
      const pdfInternal = pdf.internal
      if (pdfInternal && typeof pdfInternal.write === 'function') {
        pdfInternal.write('W n')
      }
    } else if (hasRadius) {
      // Rounded rect clip — convert radii from px to mm
      const rTLmm = pxToMm(rTL, cardPxW, cardMmW)
      const rTRmm = pxToMm(rTR, cardPxW, cardMmW)
      const rBRmm = pxToMm(rBR, cardPxW, cardMmW)
      const rBLmm = pxToMm(rBL, cardPxW, cardMmW)
      drawRoundRectPath(pdf, xMm, yMm, wMm, hMm, rTLmm, rTRmm, rBRmm, rBLmm)
      const pdfInternal = pdf.internal
      if (pdfInternal && typeof pdfInternal.write === 'function') {
        pdfInternal.write('W n')
      }
    }
  }

  // Draw the raster image
  try {
    pdf.addImage(dataUrl, 'PNG', xMm, yMm, wMm, hMm)
  } catch {
    // Skip if image fails
  }

  if (needsClip) {
    pdf.restoreGraphicsState()
  }

  // Draw vector border
  if (borderSize > 0) {
    const borderMm = pxToMm(borderSize, cardPxW, cardMmW)
    const borderRgb = parseColor(borderColor)
    pdf.setDrawColor(borderRgb.r, borderRgb.g, borderRgb.b)
    pdf.setLineWidth(borderMm)

    if (isCircle || isOval) {
      pdf.ellipse(xMm + wMm / 2, yMm + hMm / 2, wMm / 2, hMm / 2, 'S')
    } else if (isPolygon) {
      const pts = polygonPoints(xMm + wMm / 2, yMm + hMm / 2, wMm / 2, hMm / 2, sides!)
      drawPolygonLines(pdf, pts)
    } else if (hasRadius) {
      const rTLmm = pxToMm(rTL, cardPxW, cardMmW)
      const rTRmm = pxToMm(rTR, cardPxW, cardMmW)
      const rBRmm = pxToMm(rBR, cardPxW, cardMmW)
      const rBLmm = pxToMm(rBL, cardPxW, cardMmW)
      drawRoundRectPath(pdf, xMm, yMm, wMm, hMm, rTLmm, rTRmm, rBRmm, rBLmm)
      pdf.stroke()
    } else {
      pdf.rect(xMm, yMm, wMm, hMm, 'S')
    }
  }
}

// ---------------------------------------------------------------------------
// Vector QR code renderer
// ---------------------------------------------------------------------------

async function renderVectorQR(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdf: any,
  text: string,
  xMm: number,
  yMm: number,
  wMm: number,
  hMm: number,
) {
  const qr = await getQRMatrix(text)
  if (!qr) return

  const size = qr.modules.size
  const modules = qr.modules.data

  // Use the smaller dimension for a square QR
  const qrDim = Math.min(wMm, hMm)
  const moduleSize = qrDim / size

  // Center the QR in the element
  const offsetX = xMm + (wMm - qrDim) / 2
  const offsetY = yMm + (hMm - qrDim) / 2

  // White background
  pdf.setFillColor(255, 255, 255)
  pdf.rect(xMm, yMm, wMm, hMm, 'F')

  // Draw dark modules as vector rectangles
  pdf.setFillColor(0, 0, 0)
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (modules[row * size + col]) {
        pdf.rect(
          offsetX + col * moduleSize,
          offsetY + row * moduleSize,
          moduleSize,
          moduleSize,
          'F',
        )
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Vector Code128 barcode renderer
// ---------------------------------------------------------------------------

async function renderVectorBarcode(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdf: any,
  text: string,
  xMm: number,
  yMm: number,
  wMm: number,
  hMm: number,
) {
  // White background
  pdf.setFillColor(255, 255, 255)
  pdf.rect(xMm, yMm, wMm, hMm, 'F')

  const bars = await getCode128Bars(text, wMm, hMm)
  if (bars.length === 0) return

  // Draw each bar as a vector rectangle
  pdf.setFillColor(0, 0, 0)
  for (const bar of bars) {
    pdf.rect(xMm + bar.x, yMm, bar.width, bar.height, 'F')
  }
}

// ---------------------------------------------------------------------------
// Vector shape renderer
// ---------------------------------------------------------------------------

function renderVectorShape(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdf: any,
  el: CanvasElement,
  xMm: number,
  yMm: number,
  wMm: number,
  hMm: number,
) {
  const shape = (el.props.shape as string) ?? 'rectangle'
  const fill = (el.props.fill as string) ?? '#3b82f6'
  const stroke = (el.props.stroke as string) ?? 'transparent'
  const strokeW = (el.props.strokeWidth as number) ?? 0
  const bR = (el.props.borderRadius as number) ?? 0

  const fillRgb = parseColor(fill)

  if (shape === 'line') {
    pdf.setDrawColor(fillRgb.r, fillRgb.g, fillRgb.b)
    pdf.setLineWidth(0.5)
    pdf.line(xMm, yMm + hMm / 2, xMm + wMm, yMm + hMm / 2)
    return
  }

  pdf.setFillColor(fillRgb.r, fillRgb.g, fillRgb.b)

  if (shape === 'circle') {
    const rx = wMm / 2
    const ry = hMm / 2
    pdf.ellipse(xMm + rx, yMm + ry, rx, ry, 'F')
    if (strokeW > 0 && stroke !== 'transparent') {
      const strokeRgb = parseColor(stroke)
      pdf.setDrawColor(strokeRgb.r, strokeRgb.g, strokeRgb.b)
      pdf.setLineWidth(strokeW * 0.264583) // px to mm approx
      pdf.ellipse(xMm + rx, yMm + ry, rx, ry, 'S')
    }
  } else if (shape === 'rounded-rect' || bR > 0) {
    const rMm = shape === 'rounded-rect' ? 3 : bR * 0.264583
    const clampedR = Math.min(rMm, wMm / 2, hMm / 2)
    pdf.roundedRect(xMm, yMm, wMm, hMm, clampedR, clampedR, 'F')
    if (strokeW > 0 && stroke !== 'transparent') {
      const strokeRgb = parseColor(stroke)
      pdf.setDrawColor(strokeRgb.r, strokeRgb.g, strokeRgb.b)
      pdf.setLineWidth(strokeW * 0.264583)
      pdf.roundedRect(xMm, yMm, wMm, hMm, clampedR, clampedR, 'S')
    }
  } else {
    pdf.rect(xMm, yMm, wMm, hMm, 'F')
    if (strokeW > 0 && stroke !== 'transparent') {
      const strokeRgb = parseColor(stroke)
      pdf.setDrawColor(strokeRgb.r, strokeRgb.g, strokeRgb.b)
      pdf.setLineWidth(strokeW * 0.264583)
      pdf.rect(xMm, yMm, wMm, hMm, 'S')
    }
  }
}

// ---------------------------------------------------------------------------
// PDF path drawing helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawEllipsePath(pdf: any, cx: number, cy: number, rx: number, ry: number) {
  // Approximate ellipse with 4 cubic bezier curves
  const k = 0.5522848 // magic number for cubic bezier circle approximation
  const kx = rx * k
  const ky = ry * k

  const pdfScale = pdf.internal.scaleFactor
  const f = (v: number) => v * pdfScale
  const pageHeight = pdf.internal.pageSize.getHeight()
  const yf = (v: number) => (pageHeight - v) * pdfScale

  const write = pdf.internal.write.bind(pdf.internal)
  write(`${f(cx).toFixed(4)} ${yf(cy - ry).toFixed(4)} m`)
  write(`${f(cx + kx).toFixed(4)} ${yf(cy - ry).toFixed(4)} ${f(cx + rx).toFixed(4)} ${yf(cy - ky).toFixed(4)} ${f(cx + rx).toFixed(4)} ${yf(cy).toFixed(4)} c`)
  write(`${f(cx + rx).toFixed(4)} ${yf(cy + ky).toFixed(4)} ${f(cx + kx).toFixed(4)} ${yf(cy + ry).toFixed(4)} ${f(cx).toFixed(4)} ${yf(cy + ry).toFixed(4)} c`)
  write(`${f(cx - kx).toFixed(4)} ${yf(cy + ry).toFixed(4)} ${f(cx - rx).toFixed(4)} ${yf(cy + ky).toFixed(4)} ${f(cx - rx).toFixed(4)} ${yf(cy).toFixed(4)} c`)
  write(`${f(cx - rx).toFixed(4)} ${yf(cy - ky).toFixed(4)} ${f(cx - kx).toFixed(4)} ${yf(cy - ry).toFixed(4)} ${f(cx).toFixed(4)} ${yf(cy - ry).toFixed(4)} c`)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawPolygonPath(pdf: any, cx: number, cy: number, rx: number, ry: number, sides: number) {
  const pts = polygonPoints(cx, cy, rx, ry, sides)
  const pdfScale = pdf.internal.scaleFactor
  const f = (v: number) => v * pdfScale
  const pageHeight = pdf.internal.pageSize.getHeight()
  const yf = (v: number) => (pageHeight - v) * pdfScale

  const write = pdf.internal.write.bind(pdf.internal)
  pts.forEach((pt, i) => {
    if (i === 0) {
      write(`${f(pt.x).toFixed(4)} ${yf(pt.y).toFixed(4)} m`)
    } else {
      write(`${f(pt.x).toFixed(4)} ${yf(pt.y).toFixed(4)} l`)
    }
  })
  write('h') // close path
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawPolygonLines(pdf: any, pts: { x: number; y: number }[]) {
  if (pts.length < 2) return
  for (let i = 0; i < pts.length; i++) {
    const next = pts[(i + 1) % pts.length]
    pdf.line(pts[i].x, pts[i].y, next.x, next.y)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawRoundRectPath(
  pdf: any,
  x: number,
  y: number,
  w: number,
  h: number,
  tl: number,
  tr: number,
  br: number,
  bl: number,
) {
  tl = Math.min(tl, w / 2, h / 2)
  tr = Math.min(tr, w / 2, h / 2)
  br = Math.min(br, w / 2, h / 2)
  bl = Math.min(bl, w / 2, h / 2)

  const pdfScale = pdf.internal.scaleFactor
  const f = (v: number) => v * pdfScale
  const pageHeight = pdf.internal.pageSize.getHeight()
  const yf = (v: number) => (pageHeight - v) * pdfScale

  const write = pdf.internal.write.bind(pdf.internal)
  const k = 0.5522848

  // Move to start (top-left corner, after radius)
  write(`${f(x + tl).toFixed(4)} ${yf(y).toFixed(4)} m`)
  // Top edge
  write(`${f(x + w - tr).toFixed(4)} ${yf(y).toFixed(4)} l`)
  // Top-right curve
  if (tr > 0) {
    write(`${f(x + w - tr + tr * k).toFixed(4)} ${yf(y).toFixed(4)} ${f(x + w).toFixed(4)} ${yf(y + tr - tr * k).toFixed(4)} ${f(x + w).toFixed(4)} ${yf(y + tr).toFixed(4)} c`)
  }
  // Right edge
  write(`${f(x + w).toFixed(4)} ${yf(y + h - br).toFixed(4)} l`)
  // Bottom-right curve
  if (br > 0) {
    write(`${f(x + w).toFixed(4)} ${yf(y + h - br + br * k).toFixed(4)} ${f(x + w - br + br * k).toFixed(4)} ${yf(y + h).toFixed(4)} ${f(x + w - br).toFixed(4)} ${yf(y + h).toFixed(4)} c`)
  }
  // Bottom edge
  write(`${f(x + bl).toFixed(4)} ${yf(y + h).toFixed(4)} l`)
  // Bottom-left curve
  if (bl > 0) {
    write(`${f(x + bl - bl * k).toFixed(4)} ${yf(y + h).toFixed(4)} ${f(x).toFixed(4)} ${yf(y + h - bl + bl * k).toFixed(4)} ${f(x).toFixed(4)} ${yf(y + h - bl).toFixed(4)} c`)
  }
  // Left edge
  write(`${f(x).toFixed(4)} ${yf(y + tl).toFixed(4)} l`)
  // Top-left curve
  if (tl > 0) {
    write(`${f(x).toFixed(4)} ${yf(y + tl - tl * k).toFixed(4)} ${f(x + tl - tl * k).toFixed(4)} ${yf(y).toFixed(4)} ${f(x + tl).toFixed(4)} ${yf(y).toFixed(4)} c`)
  }
  write('h')
}

// ---------------------------------------------------------------------------
// Crop marks & card borders (reused from existing logic)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawCropMarks(pdf: any, x: number, y: number, w: number, h: number) {
  const CROP_LEN = 3
  const CROP_OFFSET = 1

  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.15)

  // Top-left
  pdf.line(x - CROP_OFFSET - CROP_LEN, y, x - CROP_OFFSET, y)
  pdf.line(x, y - CROP_OFFSET - CROP_LEN, x, y - CROP_OFFSET)
  // Top-right
  pdf.line(x + w + CROP_OFFSET, y, x + w + CROP_OFFSET + CROP_LEN, y)
  pdf.line(x + w, y - CROP_OFFSET - CROP_LEN, x + w, y - CROP_OFFSET)
  // Bottom-left
  pdf.line(x - CROP_OFFSET - CROP_LEN, y + h, x - CROP_OFFSET, y + h)
  pdf.line(x, y + h + CROP_OFFSET, x, y + h + CROP_OFFSET + CROP_LEN)
  // Bottom-right
  pdf.line(x + w + CROP_OFFSET, y + h, x + w + CROP_OFFSET + CROP_LEN, y + h)
  pdf.line(x + w, y + h + CROP_OFFSET, x + w, y + h + CROP_OFFSET + CROP_LEN)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawCardBorder(pdf: any, x: number, y: number, w: number, h: number) {
  pdf.setDrawColor(200, 200, 200)
  pdf.setLineWidth(0.2)
  pdf.rect(x, y, w, h)
}

// ---------------------------------------------------------------------------
// Duplex back-slot mapping (reused from print-layout)
// ---------------------------------------------------------------------------

function computeBackSlots(
  slots: CardSlot[],
  rows: number,
  cols: number,
  arrangement: string,
): CardSlot[] {
  return slots.map((_slot, idx) => {
    const row = Math.floor(idx / cols)
    const col = idx % cols
    switch (arrangement) {
      case 'normal':
        return slots[idx]
      case 'mirror-h': {
        const mirroredCol = cols - 1 - col
        return slots[row * cols + mirroredCol]
      }
      case 'mirror-v': {
        const mirroredRow = rows - 1 - row
        return slots[mirroredRow * cols + col]
      }
      case 'rotate-180': {
        const mirroredRow = rows - 1 - row
        const mirroredCol = cols - 1 - col
        return slots[mirroredRow * cols + mirroredCol]
      }
      default:
        return slots[idx]
    }
  })
}

// ---------------------------------------------------------------------------
// Page distribution for vector rendering
// (similar to distributeCards but works with member indices)
// ---------------------------------------------------------------------------

interface VectorPrintPage {
  pageNumber: number
  side: 'front' | 'back'
  cards: { slot: CardSlot; memberIndex: number }[]
}

function distributeCardsForVector(
  memberCount: number,
  layout: PageLayout,
  printMode: string,
  duplexBack: string,
): VectorPrintPage[] {
  const pages: VectorPrintPage[] = []
  const { cardsPerPage, slots } = layout

  if (printMode === 'front-only' || printMode === 'back-only') {
    const side = printMode === 'back-only' ? 'back' : 'front'
    for (let i = 0; i < memberCount; i += cardsPerPage) {
      const count = Math.min(cardsPerPage, memberCount - i)
      const cards: VectorPrintPage['cards'] = []
      for (let j = 0; j < count; j++) {
        cards.push({ slot: slots[j], memberIndex: i + j })
      }
      pages.push({ pageNumber: pages.length + 1, side: side as 'front' | 'back', cards })
    }
  } else if (printMode === 'duplex') {
    const backSlots = computeBackSlots(slots, layout.rows, layout.cols, duplexBack)
    for (let i = 0; i < memberCount; i += cardsPerPage) {
      const count = Math.min(cardsPerPage, memberCount - i)
      const frontCards: VectorPrintPage['cards'] = []
      const backCards: VectorPrintPage['cards'] = []
      for (let j = 0; j < count; j++) {
        frontCards.push({ slot: slots[j], memberIndex: i + j })
        backCards.push({ slot: backSlots[j], memberIndex: i + j })
      }
      pages.push({ pageNumber: pages.length + 1, side: 'front', cards: frontCards })
      pages.push({ pageNumber: pages.length + 1, side: 'back', cards: backCards })
    }
  } else {
    // side-by-side
    const pairsPerPage = Math.max(1, Math.floor(cardsPerPage / 2))
    for (let i = 0; i < memberCount; i += pairsPerPage) {
      const count = Math.min(pairsPerPage, memberCount - i)
      const cards: VectorPrintPage['cards'] = []
      for (let j = 0; j < count; j++) {
        cards.push({ slot: slots[j * 2] ?? slots[0], memberIndex: i + j })
      }
      pages.push({ pageNumber: pages.length + 1, side: 'front', cards })
    }
  }

  return pages
}

// ---------------------------------------------------------------------------
// Main vector PDF export function
// ---------------------------------------------------------------------------

export interface VectorPDFInput {
  design: Design
  members: Member[]
  config: PrintConfig
  /** Existing RenderedCard[] — only used as fallback reference, NOT for vector rendering */
  renderedCards?: RenderedCard[]
  onProgress?: (current: number, total: number, status: string) => void
}

export async function generateVectorPDF(input: VectorPDFInput): Promise<Blob> {
  const { design, members, config, onProgress } = input
  const { default: jsPDF } = await import('jspdf')

  const cardConfig = design.cardConfiguration
  const frontDoc = design.frontDocument
  const backDoc = design.backDocument

  const customCardMm =
    cardConfig.cardWidthMm && cardConfig.cardHeightMm
      ? { w: cardConfig.cardWidthMm, h: cardConfig.cardHeightMm }
      : undefined

  // ── Rotated-90 architecture ───────────────────────────────────────────
  // For "Rotate Cards 90°" mode, we use the proven landscape vector
  // pipeline and then rotate the finished PDF pages at the page level.
  //
  // 1. Create a landscape config clone (no card-dim swapping, no rotation)
  // 2. calculateLayout() produces normal landscape slots
  // 3. Render every element using the normal (non-rotated) vector pipeline
  // 4. Apply PDF /Rotate 90 to each page via the jsPDF putPage event
  //
  // This means renderCardVectorAtSlot always receives isRotated90=false,
  // so the element rendering is identical to working normal Landscape PDF.
  // ──────────────────────────────────────────────────────────────────────

  const isRotated90 = config.layoutMode === 'rotated-90'

  // For rotated-90: convert to an equivalent landscape config so
  // calculateLayout produces normal landscape slots (no card-dim swap,
  // no rotateCards flag).  Preserve the user's actual layout choice:
  //   autoLayout=true  → layoutMode 'automatic' (landscape auto-fit)
  //   autoLayout=false → layoutMode 'custom'    (user's rows/cols on landscape)
  //
  // Because the finished landscape pages receive a page-level /Rotate 90
  // (90° clockwise display rotation), all spatial settings must be
  // pre-transformed so they map to the correct visual axes after rotation:
  //
  //   Landscape axis        After /Rotate 90 appears as
  //   ──────────────────    ────────────────────────────
  //   horizontal (width)  → vertical
  //   vertical   (height) → horizontal
  //   left edge           → top edge
  //   right edge          → bottom edge
  //   top edge            → right edge
  //   bottom edge         → left edge
  //
  // Adjustment rotation is NOT compensated because /Rotate 90 rotates
  // both content and page edges equally, preserving their relative angle.
  const effectiveConfig: PrintConfig = isRotated90
    ? {
        ...config,
        layoutMode: (config.autoLayout ? 'automatic' : 'custom') as LayoutMode,
        orientation: 'landscape' as const,
        // Swap gaps: user's H gap → landscape V (appears visual H after /Rotate)
        gutterH: config.gutterV,
        gutterV: config.gutterH,
        // Swap rows/cols: user's columns → landscape rows (appears visual cols after /Rotate)
        rows: config.columns,
        columns: config.rows,
        // Rotate margins: landscape-left → visual-top after /Rotate 90
        margins: {
          left: config.margins.top,
          right: config.margins.bottom,
          top: config.margins.right,
          bottom: config.margins.left,
        },
        // Rotate offsets: landscape +X → visual +Y, landscape +Y → visual −X
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
  const pages = distributeCardsForVector(
    members.length,
    layout,
    config.printMode,
    config.duplexBack,
  )

  // PDF orientation: landscape for rendering (rotated-90), then /Rotate
  // will make it appear portrait. For normal modes, use config orientation.
  const pdfOrientation = isRotated90 ? 'landscape' : config.orientation

  const pdf = new jsPDF({
    orientation: pdfOrientation === 'landscape' ? 'landscape' : 'portrait',
    unit: 'mm',
    format: config.paperSize === 'a3' ? 'a3' : config.paperSize === 'a4' ? 'a4' : config.paperSize === 'letter' ? 'letter' : 'legal',
  })

  // ── Register page-level /Rotate for rotated-90 mode ───────────────────
  // The jsPDF putPage event fires while writing each page's dictionary.
  // We inject "/Rotate 90" so the PDF viewer displays the landscape
  // content rotated 90° clockwise, producing a portrait-appearing page
  // with each card rotated.
  // Using per-instance events.subscribe (not global API.events.push)
  // so this only affects this specific PDF document.
  if (isRotated90) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(pdf as any).internal.events.subscribe('putPage', function (this: any) {
      this.internal.write('/Rotate 90')
    })
  }

  const totalPages = pages.length

  for (let pi = 0; pi < pages.length; pi++) {
    const page = pages[pi]
    onProgress?.(pi + 1, totalPages, `Rendering vector page ${pi + 1} of ${totalPages}…`)

    if (pi > 0) pdf.addPage()

    // Apply side adjustment (offset + rotation)
    const adj = page.side === 'back' ? config.backAdjustment : config.frontAdjustment
    const hasAdj = adj.offsetX !== 0 || adj.offsetY !== 0 || adj.rotation !== 0

    if (hasAdj) {
      ;(pdf as any).saveGraphicsState()
      if (adj.rotation !== 0) {
        const cx = layout.pageW / 2
        const cy = layout.pageH / 2
        const rad = (adj.rotation * Math.PI) / 180
        const cos = Math.cos(rad)
        const sin = Math.sin(rad)
        ;(pdf as any).setCurrentTransformationMatrix(
          (pdf as any).Matrix(cos, sin, -sin, cos, cx - cx * cos + cy * sin, cy - cx * sin - cy * cos),
        )
      }
    }

    // Draw each card on this page — always non-rotated (isRotated90=false)
    // because page-level /Rotate handles the 90° rotation.
    for (const { slot, memberIndex } of page.cards) {
      const member = members[memberIndex]
      if (!member) continue

      const drawX = slot.x + adj.offsetX
      const drawY = slot.y + adj.offsetY

      const cardDoc = page.side === 'back' ? backDoc : frontDoc

      // Render card content as vector elements (normal, non-rotated)
      await renderCardVectorAtSlot(
        pdf as any,
        cardDoc,
        cardConfig,
        member,
        drawX,
        drawY,
        slot.w,
        slot.h,
        false, // never per-card rotation — page-level /Rotate handles it
      )

      // Card borders
      if (config.cardBorders) {
        drawCardBorder(pdf as any, drawX, drawY, slot.w, slot.h)
      }

      // Crop marks
      if (config.cropMarks) {
        drawCropMarks(pdf as any, drawX, drawY, slot.w, slot.h)
      }
    }

    // Side-by-side mode: draw back cards next to fronts
    if (config.printMode === 'side-by-side') {
      for (const { slot, memberIndex } of page.cards) {
        const member = members[memberIndex]
        if (!member) continue

        const backAdj = config.backAdjustment
        const backX = slot.x + slot.w + config.gutterH + backAdj.offsetX
        const backY = slot.y + backAdj.offsetY

        if (backX + slot.w <= layout.pageW - config.margins.right) {
          await renderCardVectorAtSlot(
            pdf as any,
            backDoc,
            cardConfig,
            member,
            backX,
            backY,
            slot.w,
            slot.h,
            false, // never per-card rotation
          )

          if (config.cardBorders) {
            drawCardBorder(pdf as any, backX, backY, slot.w, slot.h)
          }
          if (config.cropMarks) {
            drawCropMarks(pdf as any, backX, backY, slot.w, slot.h)
          }
        }
      }
    }

    // Restore graphics state
    if (hasAdj && adj.rotation !== 0) {
      ;(pdf as any).restoreGraphicsState()
    }

    // Yield to main thread
    await new Promise((r) => setTimeout(r, 0))
  }

  onProgress?.(totalPages, totalPages, 'Finalizing vector PDF…')
  return pdf.output('blob')
}

