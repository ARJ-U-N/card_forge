'use client'

import { useState } from 'react'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  GripVerticalIcon,
  LayersIcon,
  LockIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
  UnlockIcon,
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
import type { CanvasElement, CardDocument } from '@/lib/models/types'
import { DYNAMIC_FIELDS } from './left-panel'

interface Props {
  activeDoc: CardDocument
  selectedElementId: string | null
  onSelectElement: (id: string | null) => void
  onUpdateElement: (id: string, updates: Partial<CanvasElement>) => void
  onDeleteElement: (id: string) => void
  onDuplicateElement: (id: string) => void
  onReorderElement: (id: string, direction: 'up' | 'down') => void
}

type RightTab = 'customize' | 'layers'

const FONTS = [
  'Inter', 'Roboto', 'Outfit', 'Arial', 'Helvetica', 'Georgia',
  'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS',
]

export function RightPanel({
  activeDoc,
  selectedElementId,
  onSelectElement,
  onUpdateElement,
  onDeleteElement,
  onDuplicateElement,
  onReorderElement,
}: Props) {
  const [activeTab, setActiveTab] = useState<RightTab>('customize')

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
                      <Select value={(el.props.fontFamily as string) ?? 'Inter'} onValueChange={(v) => updateProp('fontFamily', v)}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FONTS.map((f) => (
                            <SelectItem key={f} value={f}><span style={{ fontFamily: f }}>{f}</span></SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                            {DYNAMIC_FIELDS.map((f) => (
                              <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                            ))}
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
                              {DYNAMIC_FIELDS.map((f) => (
                                <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                              ))}
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

                    <div className="flex flex-col gap-0.5">
                      <label className="text-[10px] text-muted-foreground">Border Radius</label>
                      <Input type="number" value={(el.props.borderRadius as number) ?? 0} className="h-7 text-xs" min={0}
                        onChange={(e) => updateProp('borderRadius', Number(e.target.value))} />
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
                  <Button variant="outline" size="xs" className="flex-1" onClick={() => onDuplicateElement(el.id)}>
                    <CopyIcon className="size-3" /> Duplicate
                  </Button>
                  <Button variant="destructive" size="xs" className="flex-1" onClick={() => onDeleteElement(el.id)}>
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
