'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { cn } from '@/lib/utils'
import type {
  CanvasElement,
  CardConfiguration,
  CardDocument,
  Member,
} from '@/lib/models/types'
import { resolveDynamicText } from '@/lib/card-renderer'

// CR-80 defaults (pixels): 324 × 204
const DEFAULT_CARD_W = 324
const DEFAULT_CARD_H = 204

// Consistent pixels-per-mm scale factor (based on CR-80: 324px / 85.6mm)
export const PX_PER_MM = DEFAULT_CARD_W / 85.6

/** Derive canvas pixel dimensions from card config (mm → px), before orientation */
function cardPixelSize(config: CardConfiguration): { w: number; h: number } {
  const wmm = config.cardWidthMm ?? 85.6
  const hmm = config.cardHeightMm ?? 54
  return {
    w: Math.round(wmm * PX_PER_MM),
    h: Math.round(hmm * PX_PER_MM),
  }
}

/**
 * Compute the visual card dimensions in pixels, applying orientation swap.
 * This is the single source of truth for the actual canvas coordinate space.
 * Use this everywhere that needs to know the rendered card width/height.
 */
export function visualCardSize(config: CardConfiguration): { w: number; h: number } {
  const { w: baseW, h: baseH } = cardPixelSize(config)
  const isVertical = config.orientation === 'vertical'
  return {
    w: isVertical ? baseH : baseW,
    h: isVertical ? baseW : baseH,
  }
}

// ---------------------------------------------------------------------------
// CSS clip-path helpers for shape support
// ---------------------------------------------------------------------------

/** Map shape name to polygon side count, or null for non-polygon shapes */
function shapeSides(shape: string): number | null {
  const map: Record<string, number> = {
    pentagon: 5, hexagon: 6, heptagon: 7, octagon: 8,
    nonagon: 9, decagon: 10,
  }
  return map[shape] ?? null
}

/** Generate CSS polygon() clip-path for a regular N-sided polygon */
function cssPolygon(sides: number): string {
  const points: string[] = []
  const angleOffset = -Math.PI / 2
  for (let i = 0; i < sides; i++) {
    const angle = angleOffset + (2 * Math.PI * i) / sides
    const x = 50 + 50 * Math.cos(angle)
    const y = 50 + 50 * Math.sin(angle)
    points.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`)
  }
  return `polygon(${points.join(', ')})`
}



// ---------------------------------------------------------------------------
// Custom font loader for design preview
// ---------------------------------------------------------------------------

const _previewLoadedFonts = new Set<string>()

function ensurePreviewFont(fontFamily: string, fontData: string) {
  if (!fontFamily || !fontData || _previewLoadedFonts.has(fontFamily)) return
  try {
    const font = new FontFace(fontFamily, `url(${fontData})`)
    font.load().then((loaded) => {
      ; (document.fonts as FontFaceSet).add(loaded)
      _previewLoadedFonts.add(fontFamily)
    }).catch(() => { })
  } catch {
    // ignore
  }
}

type DragMode = 'move' | 'resize-se' | 'resize-ne' | 'resize-sw' | 'resize-nw' | 'resize-e' | 'resize-w' | 'resize-n' | 'resize-s'

interface DragState {
  id: string
  mode: DragMode
  startMX: number
  startMY: number
  elX: number
  elY: number
  elW: number
  elH: number
}

interface Props {
  config: CardConfiguration
  document: CardDocument
  zoom: number
  selectedElementId: string | null
  onSelectElement: (id: string | null) => void
  onUpdateElement: (id: string, updates: Partial<CanvasElement>) => void
  /** Called once before a canvas drag/resize starts, to capture undo snapshot */
  onBeforeChange?: () => void
  /** Designer-only: element IDs with Max Length Text preview enabled */
  maxLengthPreviewIds?: Set<string>
  /** Designer-only: member data for Max Length Text lookup */
  members?: Member[]
}

export function CardCanvas({
  config,
  document: doc,
  zoom,
  selectedElementId,
  onSelectElement,
  onUpdateElement,
  onBeforeChange,
  maxLengthPreviewIds,
  members,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)

  const { w: baseW, h: baseH } = cardPixelSize(config)
  const isVertical = config.orientation === 'vertical'
  const cardW = isVertical ? baseH : baseW
  const cardH = isVertical ? baseW : baseH
  const scale = zoom / 100
  const safeZone = config.safeZoneMargin * 3

  const sorted = [...doc.elements].sort((a, b) => a.zIndex - b.zIndex)

  // ── Drag mechanics ────────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent, el: CanvasElement, mode: DragMode = 'move') => {
    if (el.locked) return
    e.stopPropagation()
    e.preventDefault()
    onBeforeChange?.()
    onSelectElement(el.id)
    setDrag({ id: el.id, mode, startMX: e.clientX, startMY: e.clientY, elX: el.x, elY: el.y, elW: el.width, elH: el.height })
  }

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!drag) return
    const dx = (e.clientX - drag.startMX) / scale
    const dy = (e.clientY - drag.startMY) / scale

    switch (drag.mode) {
      case 'move':
        onUpdateElement(drag.id, { x: Math.round(drag.elX + dx), y: Math.round(drag.elY + dy) })
        break
      case 'resize-se':
        onUpdateElement(drag.id, { width: Math.max(10, Math.round(drag.elW + dx)), height: Math.max(10, Math.round(drag.elH + dy)) })
        break
      case 'resize-e':
        onUpdateElement(drag.id, { width: Math.max(10, Math.round(drag.elW + dx)) })
        break
      case 'resize-s':
        onUpdateElement(drag.id, { height: Math.max(10, Math.round(drag.elH + dy)) })
        break
      case 'resize-w':
        onUpdateElement(drag.id, { x: Math.round(drag.elX + dx), width: Math.max(10, Math.round(drag.elW - dx)) })
        break
      case 'resize-n':
        onUpdateElement(drag.id, { y: Math.round(drag.elY + dy), height: Math.max(10, Math.round(drag.elH - dy)) })
        break
      case 'resize-nw':
        onUpdateElement(drag.id, { x: Math.round(drag.elX + dx), y: Math.round(drag.elY + dy), width: Math.max(10, Math.round(drag.elW - dx)), height: Math.max(10, Math.round(drag.elH - dy)) })
        break
      case 'resize-ne':
        onUpdateElement(drag.id, { y: Math.round(drag.elY + dy), width: Math.max(10, Math.round(drag.elW + dx)), height: Math.max(10, Math.round(drag.elH - dy)) })
        break
      case 'resize-sw':
        onUpdateElement(drag.id, { x: Math.round(drag.elX + dx), width: Math.max(10, Math.round(drag.elW - dx)), height: Math.max(10, Math.round(drag.elH + dy)) })
        break
    }
  }, [drag, scale, onUpdateElement])

  const handleMouseUp = useCallback(() => setDrag(null), [])

  useEffect(() => {
    if (!drag) return
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [drag, handleMouseMove, handleMouseUp])

  // ── Resize handles ────────────────────────────────────────────────────
  const ResizeHandles = ({ el }: { el: CanvasElement }) => {
    if (el.locked) return null
    const handleSize = 7
    const half = handleSize / 2
    const handles: { mode: DragMode; style: React.CSSProperties; cursor: string }[] = [
      { mode: 'resize-nw', style: { top: -half, left: -half }, cursor: 'nw-resize' },
      { mode: 'resize-ne', style: { top: -half, right: -half }, cursor: 'ne-resize' },
      { mode: 'resize-sw', style: { bottom: -half, left: -half }, cursor: 'sw-resize' },
      { mode: 'resize-se', style: { bottom: -half, right: -half }, cursor: 'se-resize' },
      { mode: 'resize-n', style: { top: -half, left: '50%', marginLeft: -half }, cursor: 'n-resize' },
      { mode: 'resize-s', style: { bottom: -half, left: '50%', marginLeft: -half }, cursor: 's-resize' },
      { mode: 'resize-w', style: { top: '50%', left: -half, marginTop: -half }, cursor: 'w-resize' },
      { mode: 'resize-e', style: { top: '50%', right: -half, marginTop: -half }, cursor: 'e-resize' },
    ]
    return (
      <>
        {handles.map((h) => (
          <div
            key={h.mode}
            className="absolute z-50 rounded-sm bg-primary border border-white shadow-sm"
            style={{ ...h.style, width: handleSize, height: handleSize, cursor: h.cursor, position: 'absolute' }}
            onMouseDown={(e) => handleMouseDown(e, el, h.mode)}
          />
        ))}
      </>
    )
  }

  // Load custom fonts for any text/field elements that use them
  for (const item of sorted) {
    if ((item.type === 'text' || item.type === 'field') && item.props.customFontData) {
      ensurePreviewFont(item.props.fontFamily as string, item.props.customFontData as string)
    }
  }

  // ── Max Length Text: compute longest value per field (Designer-only) ──
  const maxLengthValues = useMemo(() => {
    const map = new Map<string, string>()
    if (!members || members.length === 0) return map
    // Collect all field names that are currently enabled
    const enabledFields = new Set<string>()
    for (const el of doc.elements) {
      if (el.type === 'field' && maxLengthPreviewIds?.has(el.id) && el.props.fieldName) {
        enabledFields.add(el.props.fieldName as string)
      }
    }
    for (const fieldName of enabledFields) {
      let longest = ''
      for (const m of members) {
        // Use the same resolver as production rendering
        const val = resolveDynamicText(m, fieldName)
        // Skip unresolved placeholders like "{fieldName}"
        if (val && !val.startsWith('{') && val.length > longest.length) longest = val
      }
      if (longest) map.set(fieldName, longest)
    }
    return map
  }, [members, doc.elements, maxLengthPreviewIds])

  // ── Element renderers ─────────────────────────────────────────────────
  const renderElement = (el: CanvasElement) => {
    if (!el.visible) return null
    const isSelected = selectedElementId === el.id
    const opacity = (el.props.opacity as number) ?? 1

    const wrapperStyle: React.CSSProperties = {
      position: 'absolute',
      left: el.x, top: el.y,
      width: el.width, height: el.height,
      transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
      cursor: el.locked ? 'default' : 'move',
      zIndex: el.zIndex,
      opacity,
    }

    const borderSize = (el.props.borderSize as number) ?? 0
    const borderColor = (el.props.borderColor as string) ?? '#000'
    const borderRadius = (el.props.borderRadius as number) ?? 0

    switch (el.type) {
      case 'text':
        return (
          <div key={el.id} style={wrapperStyle} onMouseDown={(e) => handleMouseDown(e, el)}
            className={cn(
              'select-none overflow-hidden',
              isSelected && 'ring-2 ring-primary ring-offset-1',
              config.textBoundaries && !isSelected && 'border border-dashed border-muted-foreground/20',
            )}>
            <span style={{
              fontSize: (el.props.fontSize as number) ?? 14,
              fontWeight: (el.props.fontWeight as string) ?? 'normal',
              fontStyle: (el.props.fontStyle as string) ?? 'normal',
              color: (el.props.color as string) ?? '#000',
              fontFamily: (el.props.fontFamily as string) ?? 'Inter, sans-serif',
              textAlign: (el.props.textAlign as CanvasRenderingContext2D['textAlign']) ?? 'left',
              whiteSpace: 'pre-wrap', lineHeight: 1.3, display: 'block', width: '100%',
            }}>
              {(el.props.text as string) ?? ''}
            </span>
            {isSelected && <ResizeHandles el={el} />}
          </div>
        )

      case 'field': {
        const fieldName = (el.props.fieldName as string) ?? ''
        const isMaxLen = maxLengthPreviewIds?.has(el.id) ?? false
        const maxVal = isMaxLen ? maxLengthValues.get(fieldName) : undefined
        return (
          <div key={el.id} style={wrapperStyle} onMouseDown={(e) => handleMouseDown(e, el)}
            className={cn(
              'select-none overflow-hidden',
              isSelected && 'ring-2 ring-primary ring-offset-1',
              config.textBoundaries && !isSelected && 'border border-dashed border-blue-400/30',
            )}>
            <span style={{
              fontSize: (el.props.fontSize as number) ?? 14,
              fontWeight: (el.props.fontWeight as string) ?? 'normal',
              fontStyle: (el.props.fontStyle as string) ?? 'normal',
              color: (el.props.color as string) ?? '#000',
              fontFamily: (el.props.fontFamily as string) ?? 'Inter, sans-serif',
              textAlign: (el.props.textAlign as CanvasRenderingContext2D['textAlign']) ?? 'left',
              whiteSpace: 'pre-wrap', lineHeight: 1.3, display: 'block', width: '100%',
            }}>
              {maxVal ? (
                <>{(el.props.label as string) ?? ''}<span className="bg-amber-100/70 text-amber-800 rounded px-0.5">{maxVal}</span></>
              ) : (
                <>{(el.props.label as string) ?? ''}<span className="bg-blue-100/50 text-blue-700 rounded px-0.5">{`{${fieldName}}`}</span></>
              )}
            </span>
            {isSelected && <ResizeHandles el={el} />}
          </div>
        )
      }

      case 'image': {
        const isQR = !!el.props.qrCode
        const isBarcode = !!el.props.barcode
        const isDynamic = !!el.props.dynamic

        // Independent corner radii (backward compatible)
        const legacyR = (borderRadius as number)
        const rTL = (el.props.borderRadiusTL as number) ?? legacyR
        const rTR = (el.props.borderRadiusTR as number) ?? legacyR
        const rBR = (el.props.borderRadiusBR as number) ?? legacyR
        const rBL = (el.props.borderRadiusBL as number) ?? legacyR

        // Shape support
        const imageShape = (el.props.imageShape as string) ?? 'rectangle'
        const sides = shapeSides(imageShape)
        const isCircle = imageShape === 'circle'
        const isOval = imageShape === 'oval'
        const isPolygon = sides !== null



        // Border styling for non-polygon shapes
        const borderCss: React.CSSProperties = {}
        if (isCircle || isOval) {
          borderCss.borderRadius = '50%'
          if (borderSize > 0) {
            borderCss.border = `${borderSize}px solid ${borderColor}`
          }
        } else if (isPolygon) {
          // For polygons we cannot use CSS border, so we use an SVG overlay
          if (borderSize > 0) {
            // handled below
          }
        } else {
          // Rectangle
          borderCss.borderRadius = `${rTL}px ${rTR}px ${rBR}px ${rBL}px`
          if (borderSize > 0) {
            borderCss.border = `${borderSize}px solid ${borderColor}`
          }
        }

        return (
          <div key={el.id} style={{
            ...wrapperStyle,
            ...(!isPolygon ? borderCss : {}),
            ...(isPolygon ? { clipPath: cssPolygon(sides!) } : {}),
          }}
            className={cn(
              'select-none overflow-hidden',
              isSelected && 'ring-2 ring-primary ring-offset-1',
            )}
            onMouseDown={(e) => handleMouseDown(e, el)}>

            {isQR ? (
              <QRPreview fieldName={(el.props.fieldName as string) ?? 'employeeId'} width={el.width} height={el.height} />
            ) : isBarcode ? (
              <BarcodePreview
                fieldName={(el.props.fieldName as string) ?? 'employeeId'}
                format={(el.props.barcodeFormat as string) ?? 'CODE128'}
                width={el.width} height={el.height}
                needName={!!el.props.needName}
              />
            ) : el.props.src && !el.props.placeholder ? (
              <img src={el.props.src as string} alt="" className="size-full object-cover" draggable={false}
                style={isPolygon ? {} : (isCircle || isOval) ? { borderRadius: '50%' } : {}} />
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-0.5 bg-muted/60 border border-dashed border-muted-foreground/30">
                {isDynamic ? (
                  <>
                    <span className="text-[8px] uppercase text-muted-foreground/70 font-medium">
                      {el.props.fieldName === 'profileImage' ? '📷' : el.props.fieldName === 'signature' ? '✍️' : '🏢'}
                    </span>
                    <span className="text-[8px] text-muted-foreground truncate px-1">
                      {`{${el.props.fieldName}}`}
                    </span>
                  </>
                ) : (
                  <svg className="size-5 text-muted-foreground/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="m21 15-5-5L5 21" />
                  </svg>
                )}
              </div>
            )}
            {/* Polygon border overlay */}
            {isPolygon && borderSize > 0 && (
              <svg className="absolute inset-0 size-full pointer-events-none" viewBox={`0 0 ${el.width} ${el.height}`} preserveAspectRatio="none">
                <polygon
                  points={Array.from({ length: sides! }, (_, i) => {
                    const angle = -Math.PI / 2 + (2 * Math.PI * i) / sides!
                    return `${el.width / 2 + (el.width / 2) * Math.cos(angle)},${el.height / 2 + (el.height / 2) * Math.sin(angle)}`
                  }).join(' ')}
                  fill="none"
                  stroke={borderColor}
                  strokeWidth={borderSize}
                />
              </svg>
            )}
            {isSelected && <ResizeHandles el={el} />}
          </div>
        )
      }

      case 'shape': {
        const shape = el.props.shape as string
        const fill = (el.props.fill as string) ?? '#3b82f6'
        const stroke = (el.props.stroke as string) ?? 'transparent'
        const strokeW = (el.props.strokeWidth as number) ?? 0
        const bR = shape === 'circle' ? '50%' : shape === 'rounded-rect' ? 12 : borderRadius
        const isLine = shape === 'line'

        return (
          <div key={el.id} style={{
            ...wrapperStyle,
            backgroundColor: isLine ? 'transparent' : fill,
            borderRadius: bR,
            border: strokeW > 0 ? `${strokeW}px solid ${stroke}` : undefined,
            height: isLine ? 2 : el.height,
            borderBottom: isLine ? `2px solid ${fill}` : undefined,
          }}
            className={cn('select-none', isSelected && 'ring-2 ring-primary ring-offset-1')}
            onMouseDown={(e) => handleMouseDown(e, el)}>
            {isSelected && <ResizeHandles el={el} />}
          </div>
        )
      }

      default:
        return null
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Top ruler */}
      <div className="flex items-end" style={{ width: cardW * scale, paddingLeft: 24 }}>
        <div className="flex-1 flex justify-between text-[8px] text-muted-foreground font-mono">
          {Array.from({ length: 7 }, (_, i) => Math.round((cardW * i) / 6)).map((v) => (
            <span key={v}>{v}</span>
          ))}
        </div>
      </div>

      <div className="flex gap-1">
        {/* Left ruler */}
        <div className="flex flex-col justify-between text-[8px] text-muted-foreground font-mono w-5 py-1" style={{ height: cardH * scale }}>
          {Array.from({ length: 5 }, (_, i) => Math.round((cardH * i) / 4)).map((v) => (
            <span key={v} className="text-right">{v}</span>
          ))}
        </div>

        {/* Card surface */}
        <div
          ref={containerRef}
          className="relative overflow-hidden rounded-lg shadow-xl ring-1 ring-black/10"
          style={{
            width: cardW * scale,
            height: cardH * scale,
            background: doc.background || config.frontBackground,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) onSelectElement(null) }}
        >
          <div className="absolute inset-0 origin-top-left" style={{ transform: `scale(${scale})`, width: cardW, height: cardH }}>
            {/* Safe zone */}
            {safeZone > 0 && (
              <div className="absolute border border-dashed border-red-400/25 pointer-events-none"
                style={{ top: safeZone, left: safeZone, width: cardW - safeZone * 2, height: cardH - safeZone * 2 }} />
            )}

            {/* Slot punch */}
            {config.slotPunch !== 'none' && (
              <div className="absolute left-1/2 -translate-x-1/2 bg-black/8 border border-dashed border-muted-foreground/20 pointer-events-none"
                style={{ top: 4, width: config.slotPunch === 'long' ? 24 : 16, height: 8, borderRadius: 4 }} />
            )}

            {/* Elements */}
            {sorted.map(renderElement)}
          </div>
        </div>
      </div>

      {/* Info bar */}
      <div className="flex items-center gap-2 text-[9px] text-muted-foreground font-mono">
        <span>{cardW}×{cardH}px</span>
        <span className="capitalize">{config.orientation}</span>
        <span>{config.material === '30mil-pvc' ? '30 Mil PVC' : 'Adhesive PVC'}</span>
        {selectedElementId && (
          <>
            <span>·</span>
            <span className="text-primary">
              {(() => {
                const sel = doc.elements.find((e) => e.id === selectedElementId)
                return sel ? `${sel.type} @ ${sel.x},${sel.y}` : ''
              })()}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

// ── QR Code Preview ────────────────────────────────────────────────────
function QRPreview({ fieldName, width, height }: { fieldName: string; width: number; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    import('qrcode').then((QRCode) => {
      QRCode.toCanvas(canvas, `{${fieldName}}`, {
        width: Math.min(width, height),
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' },
      }).catch(() => {
        // Fallback: draw placeholder
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.fillStyle = '#f3f4f6'
          ctx.fillRect(0, 0, width, height)
          ctx.fillStyle = '#9ca3af'
          ctx.font = '8px sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText('QR', width / 2, height / 2 + 3)
        }
      })
    })
  }, [fieldName, width, height])

  return <canvas ref={canvasRef} className="size-full object-contain" />
}

// ── Barcode Preview ────────────────────────────────────────────────────
function BarcodePreview({ fieldName, format, width, height, needName }: { fieldName: string; format: string; width: number; height: number; needName: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current) return
    import('jsbarcode').then((JsBarcode) => {
      try {
        JsBarcode.default(svgRef.current, `{${fieldName}}`, {
          format: format as string,
          width: 1.5,
          height: Math.max(20, needName ? height - 24 : height - 16),
          displayValue: false,
          margin: 2,
          background: '#ffffff',
        })
      } catch {
        // Invalid format fallback
      }
    })
  }, [fieldName, format, width, height, needName])

  return (
    <div className="flex size-full flex-col items-center bg-white">
      <svg ref={svgRef} className={needName ? 'flex-1' : 'size-full'} />
      {needName && (
        <div className="w-full text-center text-[8px] leading-tight text-black pb-0.5 truncate px-1">
          {fieldName}
        </div>
      )}
    </div>
  )
}
