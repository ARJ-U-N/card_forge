'use client'

import { useState, useRef } from 'react'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  GripVerticalIcon,
  LayersIcon,
  Link2Icon,
  LockIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
  Unlink2Icon,
  UnlockIcon,
  UploadIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { CanvasElement, CardDocument, ColumnRoles } from '@/lib/models/types'
import { DYNAMIC_FIELDS } from './left-panel'

interface Props {
  activeDoc: CardDocument
  selectedElementId: string | null
  onSelectElement: (id: string | null) => void
  onUpdateElement: (id: string, updates: Partial<CanvasElement>) => void
  onDeleteElement: (id: string) => void
  onDuplicateElement: (id: string) => void
  onReorderElement: (id: string, direction: 'up' | 'down') => void
  /** Table columns from the linked folder (if any) */
  tableColumns?: string[]
  /** Per-column role metadata */
  tableColumnRoles?: Record<string, ColumnRoles>
}

type RightTab = 'customize' | 'layers'

const FONTS = [
  'Inter', 'Roboto', 'Outfit', 'Arial', 'Helvetica', 'Georgia',
  'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS',
]

const IMAGE_SHAPES = [
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'circle', label: 'Circle' },
  { value: 'oval', label: 'Oval' },
  { value: 'pentagon', label: 'Pentagon' },
  { value: 'hexagon', label: 'Hexagon' },
  { value: 'heptagon', label: 'Heptagon' },
  { value: 'octagon', label: 'Octagon' },
  { value: 'nonagon', label: 'Nonagon' },
  { value: 'decagon', label: 'Decagon' },
] as const

export function RightPanel({
  activeDoc,
  selectedElementId,
  onSelectElement,
  onUpdateElement,
  onDeleteElement,
  onDuplicateElement,
  onReorderElement,
  tableColumns,
  tableColumnRoles,
}: Props) {
  const [activeTab, setActiveTab] = useState<RightTab>('customize')
  const [radiusLocked, setRadiusLocked] = useState(true)
  const [customFonts, setCustomFonts] = useState<string[]>([])
  const fontInputRef = useRef<HTMLInputElement>(null)

  const el = selectedElementId
    ? activeDoc.elements.find((e) => e.id === selectedElementId) ?? null
    : null

  const sortedElements = [...activeDoc.elements].sort((a, b) => b.zIndex - a.zIndex)

  const updateProp = (key: string, value: unknown) => {
    if (!el) return
    onUpdateElement(el.id, { props: { ...el.props, [key]: value } })
  }

  // ── File picker for image replace ────────────────────────────────────
  const handleReplace = () => {
    if (!el) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onloadend = () => {
        updateProp('src', reader.result)
        updateProp('placeholder', false)
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }

  // ── Corner radius helpers ───────────────────────────────────────────
  const handleCornerChange = (corner: 'TL' | 'TR' | 'BR' | 'BL', value: number) => {
    if (!el) return
    if (radiusLocked) {
      // Update all four corners to the same value
      onUpdateElement(el.id, {
        props: {
          ...el.props,
          borderRadiusTL: value,
          borderRadiusTR: value,
          borderRadiusBR: value,
          borderRadiusBL: value,
          borderRadius: value, // keep legacy field in sync
        },
      })
    } else {
      updateProp(`borderRadius${corner}`, value)
    }
  }

  // ── Font import handler ─────────────────────────────────────────────
  const handleFontImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => {
      const dataUrl = reader.result as string
      // Derive font family name from filename (strip extension)
      const fontName = file.name.replace(/\.(ttf|otf|woff2?|TTF|OTF|WOFF2?)$/, '').replace(/[^a-zA-Z0-9\s-]/g, '')
      const familyName = `Custom-${fontName}`

      // Load font into the browser immediately
      try {
        const font = new FontFace(familyName, `url(${dataUrl})`)
        font.load().then((loaded) => {
          ; (document.fonts as FontFaceSet).add(loaded)
          setCustomFonts((prev) => prev.includes(familyName) ? prev : [...prev, familyName])
          // Apply the font and save the data URL for persistence
          if (el) {
            onUpdateElement(el.id, {
              props: {
                ...el.props,
                fontFamily: familyName,
                customFontData: dataUrl,
                customFontName: file.name,
              },
            })
          }
        }).catch(() => {
          alert('Failed to load font file. Please ensure it is a valid font.')
        })
      } catch {
        alert('Failed to load font file. Please ensure it is a valid font.')
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // Collect custom fonts already in use on this document for the selector
  const docCustomFonts = new Set<string>()
  activeDoc.elements.forEach((e) => {
    if (e.props.customFontData && e.props.fontFamily) {
      docCustomFonts.add(e.props.fontFamily as string)
    }
  })
  // Merge with session-imported custom fonts
  const allCustomFonts = Array.from(new Set([...customFonts, ...docCustomFonts]))

  return (
    <div className="flex w-60 shrink-0 flex-col border-l bg-card">
      {/* Tabs */}
      <div className="flex border-b">
        {([
          { id: 'customize' as const, label: 'Customize', icon: SlidersHorizontalIcon },
          { id: 'layers' as const, label: 'Layers', icon: LayersIcon },
        ]).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors',
              activeTab === tab.id
                ? 'border-b-2 border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <tab.icon className="size-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── CUSTOMIZE TAB ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'customize' && (
          <div className="flex flex-col gap-3">
            {el ? (
              <>
                {/* ── Position & Size ──────────────────────────────── */}
                <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Position & Size
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {(['x', 'y', 'width', 'height'] as const).map((k) => (
                    <div key={k} className="flex flex-col gap-0.5">
                      <label className="text-[10px] text-muted-foreground uppercase">{k}</label>
                      <Input type="number" value={Math.round(el[k])} className="h-7 text-xs"
                        onChange={(e) => onUpdateElement(el.id, { [k]: Number(e.target.value) })} />
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] text-muted-foreground uppercase">Rotation (°)</label>
                  <Input type="number" value={el.rotation} className="h-7 text-xs" min={-360} max={360}
                    onChange={(e) => onUpdateElement(el.id, { rotation: Number(e.target.value) })} />
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] text-muted-foreground uppercase">Opacity</label>
                  <input type="range" min={0} max={1} step={0.05}
                    value={(el.props.opacity as number) ?? 1}
                    onChange={(e) => updateProp('opacity', Number(e.target.value))}
                    className="w-full accent-primary" />
                </div>

                <Separator />

                {/* ── TEXT / FIELD PROPERTIES ──────────────────────── */}
                {(el.type === 'text' || el.type === 'field') && (
                  <>
                    <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Text Properties
                    </h4>

                    {el.type === 'text' && (
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] text-muted-foreground">Content</label>
                        <textarea
                          value={(el.props.text as string) ?? ''}
                          onChange={(e) => updateProp('text', e.target.value)}
                          className="rounded-md border bg-transparent px-2 py-1 text-xs min-h-[50px] resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          rows={2}
                        />
                      </div>
                    )}

                    {el.type === 'field' && (
                      <>
                        <div className="flex flex-col gap-0.5">
                          <label className="text-[10px] text-muted-foreground">Dynamic Binding</label>
                          <Select value={(el.props.fieldName as string) ?? ''} onValueChange={(v) => updateProp('fieldName', v)}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {DYNAMIC_FIELDS.map((f) => (
                                <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                              ))}
                              {/* Show current value if it's a custom field */}
                              {el.props.fieldName && !DYNAMIC_FIELDS.some((f) => f.key === el.props.fieldName) && (
                                <SelectItem value={el.props.fieldName as string}>Custom: {el.props.fieldName as string}</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <label className="text-[10px] text-muted-foreground">Label Prefix</label>
                          <Input value={(el.props.label as string) ?? ''} className="h-7 text-xs"
                            placeholder="e.g. ID: " onChange={(e) => updateProp('label', e.target.value)} />
                        </div>
                      </>
                    )}

                    {/* Font family */}
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[10px] text-muted-foreground">Font</label>
                      <Select value={(el.props.fontFamily as string) ?? 'Inter'} onValueChange={(v) => {
                        // When selecting a custom font from the list, copy the customFontData from the element that owns it
                        const sourceEl = activeDoc.elements.find((e) => e.props.fontFamily === v && e.props.customFontData)
                        if (sourceEl) {
                          onUpdateElement(el.id, {
                            props: {
                              ...el.props,
                              fontFamily: v,
                              customFontData: sourceEl.props.customFontData,
                              customFontName: sourceEl.props.customFontName,
                            },
                          })
                        } else {
                          // Built-in font — clear custom data
                          onUpdateElement(el.id, {
                            props: {
                              ...el.props,
                              fontFamily: v,
                              customFontData: undefined,
                              customFontName: undefined,
                            },
                          })
                        }
                      }}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FONTS.map((f) => (
                            <SelectItem key={f} value={f}><span style={{ fontFamily: f }}>{f}</span></SelectItem>
                          ))}
                          {allCustomFonts.length > 0 && (
                            <>
                              <div className="px-2 py-1 text-[9px] text-muted-foreground uppercase tracking-wider border-t mt-1 pt-1">Imported Fonts</div>
                              {allCustomFonts.map((f) => (
                                <SelectItem key={f} value={f}><span style={{ fontFamily: f }}>{f}</span></SelectItem>
                              ))}
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Import Font */}
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        onClick={() => fontInputRef.current?.click()}
                        className="flex items-center gap-1.5 rounded-md border border-dashed px-2 py-1.5 text-[10px] text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
                      >
                        <UploadIcon className="size-3" />
                        Import Font (.ttf, .otf, .woff, .woff2)
                      </button>
                      <input
                        ref={fontInputRef}
                        type="file"
                        accept=".ttf,.otf,.woff,.woff2"
                        className="hidden"
                        onChange={handleFontImport}
                      />
                      {el.props.customFontName && (
                        <span className="text-[9px] text-muted-foreground truncate">
                          Using: {String(el.props.customFontName)}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] text-muted-foreground">Size</label>
                        <Input type="number" value={(el.props.fontSize as number) ?? 14} className="h-7 text-xs" min={6} max={120}
                          onChange={(e) => updateProp('fontSize', Number(e.target.value))} />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] text-muted-foreground">Color</label>
                        <input type="color" value={(el.props.color as string) ?? '#000000'}
                          className="h-7 w-full cursor-pointer rounded border p-0.5"
                          onChange={(e) => updateProp('color', e.target.value)} />
                      </div>
                    </div>

                    {/* Weight & Style */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] text-muted-foreground">Weight</label>
                        <Select value={(el.props.fontWeight as string) ?? 'normal'} onValueChange={(v) => updateProp('fontWeight', v)}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="normal">Normal</SelectItem>
                            <SelectItem value="bold">Bold</SelectItem>
                            <SelectItem value="300">Light</SelectItem>
                            <SelectItem value="500">Medium</SelectItem>
                            <SelectItem value="600">Semibold</SelectItem>
                            <SelectItem value="800">Extra Bold</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] text-muted-foreground">Style</label>
                        <Select value={(el.props.fontStyle as string) ?? 'normal'} onValueChange={(v) => updateProp('fontStyle', v)}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="normal">Normal</SelectItem>
                            <SelectItem value="italic">Italic</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Alignment */}
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[10px] text-muted-foreground">Alignment</label>
                      <div className="flex rounded-md border">
                        {(['left', 'center', 'right'] as const).map((a) => (
                          <button key={a} type="button" onClick={() => updateProp('textAlign', a)}
                            className={cn(
                              'flex-1 py-1 text-[10px] capitalize transition-colors',
                              (el.props.textAlign as string) === a ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                            )}>
                            {a}
                          </button>
                        ))}
                      </div>
                    </div>

                    <Separator />
                  </>
                )}

                {/* ── IMAGE PROPERTIES ─────────────────────────────── */}
                {el.type === 'image' && (
                  <>
                    <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Image Properties
                    </h4>

                    {/* Dynamic binding for images */}
                    {el.props.dynamic && !el.props.qrCode && !el.props.barcode && (
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] text-muted-foreground">Linked Member Field</label>
                        <Select value={(el.props.fieldName as string) ?? 'profileImage'} onValueChange={(v) => updateProp('fieldName', v)}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="profileImage">Headshot</SelectItem>
                            <SelectItem value="signature">Signature</SelectItem>
                            <SelectItem value="divisionLogo">Logo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* QR field binding */}
                    {el.props.qrCode && (
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] text-muted-foreground">QR Data Source</label>
                        <Select value={(el.props.fieldName as string) ?? 'employeeId'} onValueChange={(v) => updateProp('fieldName', v)}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {/* Show QR-role columns if available, otherwise fall back to legacy */}
                            {tableColumns && tableColumns.length > 0 ? (
                              tableColumns
                                .filter((col) => tableColumnRoles?.[col]?.isQrCode)
                                .length > 0
                                ? tableColumns
                                    .filter((col) => tableColumnRoles?.[col]?.isQrCode)
                                    .map((col) => (
                                      <SelectItem key={col} value={col}>{col}</SelectItem>
                                    ))
                                : tableColumns.map((col) => (
                                    <SelectItem key={col} value={col}>{col}</SelectItem>
                                  ))
                            ) : (
                              DYNAMIC_FIELDS.map((f) => (
                                <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Barcode field binding */}
                    {el.props.barcode && (
                      <>
                        <div className="flex flex-col gap-0.5">
                          <label className="text-[10px] text-muted-foreground">Barcode Data Source</label>
                          <Select value={(el.props.fieldName as string) ?? 'employeeId'} onValueChange={(v) => updateProp('fieldName', v)}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {/* Show barcode-role columns if available, otherwise fall back to legacy */}
                              {tableColumns && tableColumns.length > 0 ? (
                                tableColumns
                                  .filter((col) => tableColumnRoles?.[col]?.isBarcode)
                                  .length > 0
                                  ? tableColumns
                                      .filter((col) => tableColumnRoles?.[col]?.isBarcode)
                                      .map((col) => (
                                        <SelectItem key={col} value={col}>{col}</SelectItem>
                                      ))
                                  : tableColumns.map((col) => (
                                      <SelectItem key={col} value={col}>{col}</SelectItem>
                                    ))
                              ) : (
                                DYNAMIC_FIELDS.map((f) => (
                                  <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <label className="text-[10px] text-muted-foreground">Format</label>
                          <Select value={(el.props.barcodeFormat as string) ?? 'CODE128'} onValueChange={(v) => updateProp('barcodeFormat', v)}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="CODE128">Code 128</SelectItem>
                              <SelectItem value="CODE39">Code 39</SelectItem>
                              <SelectItem value="EAN13">EAN-13</SelectItem>
                              <SelectItem value="UPC">UPC</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}

                    <Button variant="outline" size="xs" onClick={handleReplace} className="w-full">
                      Browse New Image
                    </Button>

                    {/* Shape */}
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[10px] text-muted-foreground">Shape</label>
                      <Select value={(el.props.imageShape as string) ?? 'rectangle'} onValueChange={(v) => updateProp('imageShape', v)}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {IMAGE_SHAPES.map((s) => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Border */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] text-muted-foreground">Border Size</label>
                        <Input type="number" value={(el.props.borderSize as number) ?? 0} className="h-7 text-xs" min={0} max={20}
                          onChange={(e) => updateProp('borderSize', Number(e.target.value))} />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] text-muted-foreground">Border Color</label>
                        <input type="color" value={(el.props.borderColor as string) ?? '#000000'}
                          className="h-7 w-full cursor-pointer rounded border p-0.5"
                          onChange={(e) => updateProp('borderColor', e.target.value)} />
                      </div>
                    </div>

                    {/* Independent Corner Radius */}
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] text-muted-foreground">Corner Radius</label>
                        <button
                          type="button"
                          onClick={() => setRadiusLocked((prev) => !prev)}
                          className={cn(
                            'flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] transition-colors',
                            radiusLocked
                              ? 'bg-primary/10 text-primary'
                              : 'bg-muted text-muted-foreground hover:text-foreground',
                          )}
                          title={radiusLocked ? 'Linked — all corners change together' : 'Unlinked — each corner is independent'}
                        >
                          {radiusLocked ? <Link2Icon className="size-3" /> : <Unlink2Icon className="size-3" />}
                          {radiusLocked ? 'Linked' : 'Independent'}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(['TL', 'TR', 'BL', 'BL_DUMMY'] as const).map((corner, idx) => {
                          // We render TL, TR on top row and BL, BR on bottom row
                          const actualCorner = idx === 0 ? 'TL' : idx === 1 ? 'TR' : idx === 2 ? 'BL' : 'BR'
                          const label = idx === 0 ? 'Top Left' : idx === 1 ? 'Top Right' : idx === 2 ? 'Bottom Left' : 'Bottom Right'
                          const legacyR = (el.props.borderRadius as number) ?? 0
                          const propKey = `borderRadius${actualCorner}` as string
                          const val = (el.props[propKey] as number) ?? legacyR
                          return (
                            <div key={actualCorner} className="flex flex-col gap-0.5">
                              <label className="text-[9px] text-muted-foreground">{label}</label>
                              <Input type="number" value={val} className="h-6 text-[10px]" min={0}
                                onChange={(e) => handleCornerChange(actualCorner as 'TL' | 'TR' | 'BR' | 'BL', Number(e.target.value))} />
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <Separator />
                  </>
                )}

                {/* ── SHAPE PROPERTIES ────────────────────────────── */}
                {el.type === 'shape' && (
                  <>
                    <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Shape Properties
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] text-muted-foreground">Fill</label>
                        <input type="color" value={(el.props.fill as string) ?? '#3b82f6'}
                          className="h-7 w-full cursor-pointer rounded border p-0.5"
                          onChange={(e) => updateProp('fill', e.target.value)} />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] text-muted-foreground">Stroke</label>
                        <input type="color" value={(el.props.stroke as string) ?? '#000000'}
                          className="h-7 w-full cursor-pointer rounded border p-0.5"
                          onChange={(e) => updateProp('stroke', e.target.value)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] text-muted-foreground">Stroke Width</label>
                        <Input type="number" value={(el.props.strokeWidth as number) ?? 0} className="h-7 text-xs" min={0}
                          onChange={(e) => updateProp('strokeWidth', Number(e.target.value))} />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] text-muted-foreground">Radius</label>
                        <Input type="number" value={(el.props.borderRadius as number) ?? 0} className="h-7 text-xs" min={0}
                          onChange={(e) => updateProp('borderRadius', Number(e.target.value))} />
                      </div>
                    </div>
                    <Separator />
                  </>
                )}

                {/* ── Actions ─────────────────────────────────────── */}
                <div className="flex gap-1.5">
                  <Button
                    variant={el.locked ? 'default' : 'outline'}
                    size="xs"
                    className="flex-1"
                    onClick={() => onUpdateElement(el.id, { locked: !el.locked })}
                  >
                    {el.locked ? <LockIcon className="size-3" /> : <UnlockIcon className="size-3" />}
                    {el.locked ? 'Locked' : 'Lock'}
                  </Button>
                  <Button variant="outline" size="xs" className="flex-1" onClick={() => onDuplicateElement(el.id)}>
                    <CopyIcon className="size-3" /> Duplicate
                  </Button>
                  <Button variant="destructive" size="xs" className="flex-1" onClick={() => onDeleteElement(el.id)} disabled={el.locked}>
                    <Trash2Icon className="size-3" /> Delete
                  </Button>
                </div>
              </>
            ) : (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Select an element on the canvas to view and edit its properties.
              </p>
            )}
          </div>
        )}

        {/* ── LAYERS TAB ──────────────────────────────────────────── */}
        {activeTab === 'layers' && (
          <div className="flex flex-col gap-1">
            <h3 className="mb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Layers ({sortedElements.length})
            </h3>
            {sortedElements.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No elements on this side yet.
              </p>
            ) : (
              sortedElements.map((item) => {
                const label =
                  item.type === 'text'
                    ? ((item.props.text as string) ?? 'Text').slice(0, 18)
                    : item.type === 'field'
                      ? `⚡ ${item.props.fieldName}`
                      : item.type === 'image'
                        ? item.props.qrCode
                          ? '▦ QR Code'
                          : item.props.barcode
                            ? '║ Barcode'
                            : item.props.dynamic
                              ? `📷 ${item.props.fieldName}`
                              : '🖼 Image'
                        : `◆ ${(item.props.shape as string) ?? 'Shape'}`

                return (
                  <div
                    key={item.id}
                    className={cn(
                      'group flex items-center gap-1 rounded-md px-1.5 py-1 text-xs transition-colors',
                      selectedElementId === item.id
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <button type="button" onClick={() => onSelectElement(item.id)} className="flex flex-1 items-center gap-1.5 text-left truncate">
                      <GripVerticalIcon className="size-3 shrink-0 opacity-30" />
                      <span className="truncate">{label}</span>
                    </button>
                    <div className="flex items-center gap-px opacity-0 group-hover:opacity-100 transition-opacity">
                      <button type="button" onClick={() => onReorderElement(item.id, 'up')} className="p-0.5 hover:text-foreground" title="Move up">
                        <ArrowUpIcon className="size-3" />
                      </button>
                      <button type="button" onClick={() => onReorderElement(item.id, 'down')} className="p-0.5 hover:text-foreground" title="Move down">
                        <ArrowDownIcon className="size-3" />
                      </button>
                      <button type="button" onClick={() => onUpdateElement(item.id, { visible: !item.visible })} className="p-0.5 hover:text-foreground">
                        {item.visible ? <EyeIcon className="size-3" /> : <EyeOffIcon className="size-3" />}
                      </button>
                      <button type="button" onClick={() => onUpdateElement(item.id, { locked: !item.locked })} className="p-0.5 hover:text-foreground">
                        {item.locked ? <LockIcon className="size-3" /> : <UnlockIcon className="size-3" />}
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}
