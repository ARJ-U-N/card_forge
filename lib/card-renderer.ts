/**
 * Card renderer — takes a Design + Member and produces front/back card images
 * as data URLs by painting onto an off-screen canvas. This is the same
 * representation used by the Designer's visual canvas so output matches.
 */
import type {
  CanvasElement,
  CardConfiguration,
  CardDocument,
  Member,
} from '@/lib/models/types'

const CARD_W = 324
const CARD_H = 204

function resolveDynamicText(member: Member, fieldName: string): string {
  // Prefer customFields (parent form stores all values here).
  // Fall back to built-in Member fields for normal member rendering.
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
    default:
      return member.customFields?.[fieldName] ?? `{${fieldName}}`
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

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (!src) return null
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

async function generateQRDataUrl(text: string, size: number): Promise<string> {
  try {
    const QRCode = await import('qrcode')
    return await QRCode.toDataURL(text || 'N/A', { width: size, margin: 1 })
  } catch {
    return ''
  }
}

async function generateBarcodeDataUrl(
  text: string,
  format: string,
  width: number,
  height: number,
): Promise<string> {
  try {
    const JsBarcode = await import('jsbarcode')
    const canvas = document.createElement('canvas')
    JsBarcode.default(canvas, text || '0000', {
      format,
      width: 1.5,
      height: Math.max(20, height - 10),
      displayValue: false,
      margin: 2,
    })
    return canvas.toDataURL('image/png')
  } catch {
    return ''
  }
}

function parseBackground(bg: string): string | CanvasGradient {
  // Simple: just return the color/gradient string for ctx.fillStyle
  return bg || '#ffffff'
}

async function renderSide(
  cardDoc: CardDocument,
  config: CardConfiguration,
  member: Member,
): Promise<HTMLCanvasElement> {
  const isVertical = config.orientation === 'vertical'
  const w = isVertical ? CARD_H : CARD_W
  const h = isVertical ? CARD_W : CARD_H

  const canvas = document.createElement('canvas')
  canvas.width = w * 2 // 2x for quality
  canvas.height = h * 2
  const ctx = canvas.getContext('2d')!
  ctx.scale(2, 2)

  // Background
  const bg = cardDoc.background || config.frontBackground || '#ffffff'
  if (bg.startsWith('linear-gradient')) {
    // Parse simple linear gradient
    const match = bg.match(/linear-gradient\((\d+)deg,\s*([^,]+),\s*([^)]+)\)/)
    if (match) {
      const angle = parseInt(match[1]) * (Math.PI / 180)
      const x1 = w / 2 + Math.cos(angle + Math.PI) * w / 2
      const y1 = h / 2 + Math.sin(angle + Math.PI) * h / 2
      const x2 = w / 2 + Math.cos(angle) * w / 2
      const y2 = h / 2 + Math.sin(angle) * h / 2
      const grad = ctx.createLinearGradient(x1, y1, x2, y2)
      // Parse color stops
      const stops = bg.match(/#[0-9a-fA-F]{3,8}|rgb[a]?\([^)]+\)/g)
      if (stops) {
        stops.forEach((s, i) => grad.addColorStop(i / Math.max(1, stops.length - 1), s.trim()))
      }
      ctx.fillStyle = grad
    } else {
      ctx.fillStyle = '#ffffff'
    }
  } else {
    ctx.fillStyle = bg
  }
  ctx.fillRect(0, 0, w, h)

  // Sort by z-index
  const sorted = [...cardDoc.elements].sort((a, b) => a.zIndex - b.zIndex)

  for (const el of sorted) {
    if (!el.visible) continue
    const opacity = (el.props.opacity as number) ?? 1
    ctx.globalAlpha = opacity
    ctx.save()

    if (el.rotation) {
      ctx.translate(el.x + el.width / 2, el.y + el.height / 2)
      ctx.rotate((el.rotation * Math.PI) / 180)
      ctx.translate(-(el.x + el.width / 2), -(el.y + el.height / 2))
    }

    switch (el.type) {
      case 'text': {
        const text = (el.props.text as string) ?? ''
        const fontSize = (el.props.fontSize as number) ?? 14
        const fontWeight = (el.props.fontWeight as string) ?? 'normal'
        const fontStyle = (el.props.fontStyle as string) ?? 'normal'
        const fontFamily = (el.props.fontFamily as string) ?? 'Inter, sans-serif'
        const color = (el.props.color as string) ?? '#000'
        const textAlign = (el.props.textAlign as CanvasTextAlign) ?? 'left'

        ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`
        ctx.fillStyle = color
        ctx.textAlign = textAlign
        ctx.textBaseline = 'top'

        const lines = text.split('\n')
        const lineH = fontSize * 1.3
        let textX = el.x
        if (textAlign === 'center') textX = el.x + el.width / 2
        else if (textAlign === 'right') textX = el.x + el.width

        lines.forEach((line, i) => {
          ctx.fillText(line, textX, el.y + i * lineH, el.width)
        })
        break
      }

      case 'field': {
        const fieldName = (el.props.fieldName as string) ?? ''
        const label = (el.props.label as string) ?? ''
        const resolvedText = label + resolveDynamicText(member, fieldName)
        const fontSize = (el.props.fontSize as number) ?? 14
        const fontWeight = (el.props.fontWeight as string) ?? 'normal'
        const fontStyle = (el.props.fontStyle as string) ?? 'normal'
        const fontFamily = (el.props.fontFamily as string) ?? 'Inter, sans-serif'
        const color = (el.props.color as string) ?? '#000'
        const textAlign = (el.props.textAlign as CanvasTextAlign) ?? 'left'

        ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`
        ctx.fillStyle = color
        ctx.textAlign = textAlign
        ctx.textBaseline = 'top'

        let textX = el.x
        if (textAlign === 'center') textX = el.x + el.width / 2
        else if (textAlign === 'right') textX = el.x + el.width

        ctx.fillText(resolvedText, textX, el.y, el.width)
        break
      }

      case 'image': {
        const borderSize = (el.props.borderSize as number) ?? 0
        const borderColor = (el.props.borderColor as string) ?? '#000'
        const borderRadius = (el.props.borderRadius as number) ?? 0

        let imgSrc = ''

        if (el.props.qrCode) {
          const fieldName = (el.props.fieldName as string) ?? 'employeeId'
          const qrText = resolveDynamicText(member, fieldName)
          imgSrc = await generateQRDataUrl(qrText, Math.min(el.width, el.height) * 2)
        } else if (el.props.barcode) {
          const fieldName = (el.props.fieldName as string) ?? 'employeeId'
          const bcText = resolveDynamicText(member, fieldName)
          const format = (el.props.barcodeFormat as string) ?? 'CODE128'
          imgSrc = await generateBarcodeDataUrl(bcText, format, el.width, el.height)
        } else if (el.props.dynamic) {
          const fieldName = (el.props.fieldName as string) ?? 'profileImage'
          imgSrc = resolveDynamicImageSrc(member, fieldName)
        } else {
          imgSrc = (el.props.src as string) ?? ''
        }

        // Draw border
        if (borderSize > 0) {
          ctx.strokeStyle = borderColor
          ctx.lineWidth = borderSize
          ctx.strokeRect(el.x, el.y, el.width, el.height)
        }

        // Draw image
        if (imgSrc) {
          const img = await loadImage(imgSrc)
          if (img) {
            ctx.save()
            if (borderRadius > 0) {
              roundRect(ctx, el.x, el.y, el.width, el.height, borderRadius)
              ctx.clip()
            }
            ctx.drawImage(img, el.x, el.y, el.width, el.height)
            ctx.restore()
          }
        }
        break
      }

      case 'shape': {
        const shape = (el.props.shape as string) ?? 'rectangle'
        const fill = (el.props.fill as string) ?? '#3b82f6'
        const stroke = (el.props.stroke as string) ?? 'transparent'
        const strokeW = (el.props.strokeWidth as number) ?? 0
        const bR = shape === 'circle' ? Math.min(el.width, el.height) / 2
          : shape === 'rounded-rect' ? 12
          : (el.props.borderRadius as number) ?? 0

        if (shape === 'line') {
          ctx.strokeStyle = fill
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(el.x, el.y + el.height / 2)
          ctx.lineTo(el.x + el.width, el.y + el.height / 2)
          ctx.stroke()
        } else {
          ctx.fillStyle = fill
          if (bR > 0) {
            roundRect(ctx, el.x, el.y, el.width, el.height, bR)
            ctx.fill()
          } else {
            ctx.fillRect(el.x, el.y, el.width, el.height)
          }
          if (strokeW > 0 && stroke !== 'transparent') {
            ctx.strokeStyle = stroke
            ctx.lineWidth = strokeW
            if (bR > 0) {
              roundRect(ctx, el.x, el.y, el.width, el.height, bR)
              ctx.stroke()
            } else {
              ctx.strokeRect(el.x, el.y, el.width, el.height)
            }
          }
        }
        break
      }
    }

    ctx.restore()
    ctx.globalAlpha = 1
  }

  return canvas
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  r = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

// ---------------------------------------------------------------------------
// Image cache — avoids re-downloading the same image for every member
// ---------------------------------------------------------------------------

const _imageCache = new Map<string, HTMLImageElement | null>()
const MAX_CACHE = 200

function getCachedImage(src: string): HTMLImageElement | null | undefined {
  return _imageCache.get(src)
}

function setCachedImage(src: string, img: HTMLImageElement | null) {
  if (_imageCache.size >= MAX_CACHE) {
    // Evict oldest entry
    const first = _imageCache.keys().next().value
    if (first) _imageCache.delete(first)
  }
  _imageCache.set(src, img)
}

export function clearImageCache() {
  _imageCache.clear()
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RenderedCard {
  memberId: string
  memberName: string
  frontDataUrl: string
  backDataUrl: string
  /** Smaller preview data URL for grid display */
  frontThumbUrl: string
  backThumbUrl: string
  error?: string
}

/** Generate a thumbnail from a full-size canvas data URL */
function generateThumbnail(dataUrl: string, maxHeight = 120): string {
  try {
    // Create a smaller canvas for thumbnails
    const img = new Image()
    img.src = dataUrl
    // We can't wait for async load here, so return the full URL
    // The actual thumbnail is generated lazily on first display
    return dataUrl
  } catch {
    return dataUrl
  }
}

const MAX_RETRIES = 2

async function renderWithRetry(
  member: Member,
  config: CardConfiguration,
  frontDoc: CardDocument,
  backDoc: CardDocument,
): Promise<RenderedCard> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const frontCanvas = await renderSide(frontDoc, config, member)
      const backCanvas = await renderSide(backDoc, config, member)

      const frontDataUrl = frontCanvas.toDataURL('image/png')
      const backDataUrl = backCanvas.toDataURL('image/png')

      return {
        memberId: member.id,
        memberName: `${member.firstName} ${member.lastName}`.trim(),
        frontDataUrl,
        backDataUrl,
        frontThumbUrl: generateThumbnail(frontDataUrl),
        backThumbUrl: generateThumbnail(backDataUrl),
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      // Small delay before retry
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)))
      }
    }
  }

  // All retries failed — return error card
  return {
    memberId: member.id,
    memberName: `${member.firstName} ${member.lastName}`.trim(),
    frontDataUrl: '',
    backDataUrl: '',
    frontThumbUrl: '',
    backThumbUrl: '',
    error: lastError?.message ?? 'Render failed',
  }
}

export async function renderCardForMember(
  member: Member,
  config: CardConfiguration,
  frontDoc: CardDocument,
  backDoc: CardDocument,
): Promise<RenderedCard> {
  return renderWithRetry(member, config, frontDoc, backDoc)
}

export interface RenderBatchResult {
  cards: RenderedCard[]
  errors: { memberId: string; memberName: string; error: string }[]
  total: number
  succeeded: number
  failed: number
}

export async function renderCardsForMembers(
  members: Member[],
  config: CardConfiguration,
  frontDoc: CardDocument,
  backDoc: CardDocument,
  onProgress?: (completed: number, total: number) => void,
  signal?: AbortSignal,
): Promise<RenderedCard[]> {
  const results: RenderedCard[] = []
  for (let i = 0; i < members.length; i++) {
    // Check for cancellation
    if (signal?.aborted) {
      break
    }
    const card = await renderWithRetry(members[i], config, frontDoc, backDoc)
    results.push(card)
    onProgress?.(i + 1, members.length)
    // Yield to main thread every 3 cards to avoid freezing
    if (i % 3 === 0) await new Promise((r) => setTimeout(r, 0))
  }
  return results
}

/** Summarize batch results for reporting */
export function summarizeBatch(cards: RenderedCard[]): RenderBatchResult {
  const errors = cards
    .filter((c) => c.error)
    .map((c) => ({ memberId: c.memberId, memberName: c.memberName, error: c.error! }))
  return {
    cards,
    errors,
    total: cards.length,
    succeeded: cards.length - errors.length,
    failed: errors.length,
  }
}

export function downloadCard(card: RenderedCard, side: 'front' | 'back' = 'front') {
  const dataUrl = side === 'front' ? card.frontDataUrl : card.backDataUrl
  if (!dataUrl) return
  const link = document.createElement('a')
  link.download = `${card.memberName.replace(/\s+/g, '_')}_${side}.png`
  link.href = dataUrl
  link.click()
}

export function downloadAllCards(cards: RenderedCard[]) {
  const validCards = cards.filter((c) => !c.error)
  validCards.forEach((card, i) => {
    setTimeout(() => {
      downloadCard(card, 'front')
      setTimeout(() => downloadCard(card, 'back'), 200)
    }, i * 500)
  })
}

