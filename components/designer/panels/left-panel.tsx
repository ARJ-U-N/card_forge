'use client'

import { useRef, useState } from 'react'
import {
  CameraIcon,
  CreditCardIcon,
  ImageIcon,
  PlusIcon,
  ShapesIcon,
  ShieldIcon,
  TypeIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import type {
  CanvasElement,
  CardConfiguration,
  CardDocument,
} from '@/lib/models/types'
import { CardOptionsPanel } from './card-options-panel'

// ---------------------------------------------------------------------------
// Dynamic field definitions
// ---------------------------------------------------------------------------
export const DYNAMIC_FIELDS = [
  { key: 'firstName', label: 'First Name' },
  { key: 'lastName', label: 'Last Name' },
  { key: 'fullName', label: 'Full Name' },
  { key: 'dateOfBirth', label: 'Date of Birth' },
  { key: 'title', label: 'Title' },
  { key: 'gender', label: 'Gender' },
  { key: 'employeeId', label: 'Employee ID' },
  { key: 'idNumber', label: 'ID Number' },
  { key: 'parentPhone', label: 'Parent Phone' },
  { key: 'hireDate', label: 'Hire Date' },
  { key: 'branch', label: 'Branch' },
  { key: 'department', label: 'Department' },
  { key: 'expireDate', label: 'Expire Date' },
  { key: 'roomId', label: 'Room ID' },
] as const

export const DYNAMIC_IMAGE_FIELDS = [
  { key: 'profileImage', label: 'Headshot / Photo' },
  { key: 'signature', label: 'Signature' },
  { key: 'divisionLogo', label: 'Company / Division Logo' },
] as const

interface Props {
  config: CardConfiguration
  onConfigChange: (config: CardConfiguration) => void
  activeDoc: CardDocument
  activeSide: 'front' | 'back'
  onAddElement: (element: CanvasElement) => void
  /** Table columns from the linked school folder (if any) */
  tableColumns?: string[]
  /** Per-column type metadata — determines image vs text columns */
  tableColumnTypes?: Record<string, 'text' | 'image'>
}

const TABS = [
  { id: 'options', label: 'Card Options', icon: CreditCardIcon },
  { id: 'text', label: 'Text', icon: TypeIcon },
  { id: 'images', label: 'Images', icon: ImageIcon },
  { id: 'security', label: 'Security', icon: ShieldIcon },
  { id: 'shapes', label: 'Shapes', icon: ShapesIcon },
] as const

type TabId = (typeof TABS)[number]['id']

let _idCounter = 0
function nextId(prefix: string) {
  return `${prefix}-${Date.now()}-${++_idCounter}`
}

export function LeftPanel({
  config,
  onConfigChange,
  activeDoc,
  activeSide,
  onAddElement,
  tableColumns,
  tableColumnTypes,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('options')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const nextZ = activeDoc.elements.length + 1

  // ── Text helpers ──────────────────────────────────────────────────────
  const addStaticText = (multiline = false) => {
    onAddElement({
      id: nextId('txt'),
      type: 'text',
      x: 40, y: 40,
      width: multiline ? 200 : 150,
      height: multiline ? 60 : 26,
      rotation: 0,
      props: {
        text: multiline ? 'Multi-line\ntext here' : 'New Text',
        fontSize: 14, fontWeight: 'normal', fontStyle: 'normal',
        color: '#000000', fontFamily: 'Inter',
        textAlign: 'left', opacity: 1, multiline,
      },
      locked: false, visible: true, zIndex: nextZ,
    })
  }

  const addDynamicField = (fieldKey: string, label: string) => {
    onAddElement({
      id: nextId('fld'),
      type: 'field',
      x: 40, y: 40,
      width: 180, height: 24,
      rotation: 0,
      props: {
        fieldName: fieldKey, label: '',
        fontSize: 13, fontWeight: 'normal', fontStyle: 'normal',
        color: '#000000', fontFamily: 'Inter',
        textAlign: 'left', opacity: 1,
      },
      locked: false, visible: true, zIndex: nextZ,
    })
  }

  // ── Image helpers ─────────────────────────────────────────────────────
  const addImagePlaceholder = () => {
    onAddElement({
      id: nextId('img'),
      type: 'image',
      x: 40, y: 40,
      width: 80, height: 80,
      rotation: 0,
      props: {
        src: '', placeholder: true, opacity: 1,
        borderSize: 0, borderColor: '#000000', borderRadius: 0,
      },
      locked: false, visible: true, zIndex: nextZ,
    })
  }

  const addDynamicImage = (fieldKey: string) => {
    onAddElement({
      id: nextId('dimg'),
      type: 'image',
      x: 40, y: 40,
      width: fieldKey === 'signature' ? 120 : 80,
      height: fieldKey === 'signature' ? 50 : 100,
      rotation: 0,
      props: {
        src: '', placeholder: true, dynamic: true, fieldName: fieldKey,
        opacity: 1, borderSize: 0, borderColor: '#000000', borderRadius: 0,
      },
      locked: false, visible: true, zIndex: nextZ,
    })
  }

  const handleUploadImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => {
      onAddElement({
        id: nextId('uimg'),
        type: 'image',
        x: 40, y: 40,
        width: 100, height: 100,
        rotation: 0,
        props: {
          src: reader.result as string, placeholder: false,
          opacity: 1, borderSize: 0, borderColor: '#000000', borderRadius: 0,
        },
        locked: false, visible: true, zIndex: nextZ,
      })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const addQRCode = () => {
    onAddElement({
      id: nextId('qr'),
      type: 'image',
      x: 40, y: 40,
      width: 70, height: 70,
      rotation: 0,
      props: {
        src: '', qrCode: true, dynamic: true,
        fieldName: 'employeeId', placeholder: true,
        opacity: 1, borderSize: 0, borderColor: '#000000', borderRadius: 0,
      },
      locked: false, visible: true, zIndex: nextZ,
    })
  }

  const addBarcode = () => {
    onAddElement({
      id: nextId('bc'),
      type: 'image',
      x: 40, y: 40,
      width: 160, height: 50,
      rotation: 0,
      props: {
        src: '', barcode: true, dynamic: true,
        fieldName: 'employeeId', barcodeFormat: 'CODE128',
        placeholder: true,
        opacity: 1, borderSize: 0, borderColor: '#000000', borderRadius: 0,
      },
      locked: false, visible: true, zIndex: nextZ,
    })
  }

  // ── Shape helpers ─────────────────────────────────────────────────────
  const addShape = (shape: string) => {
    const isLine = shape === 'line'
    onAddElement({
      id: nextId('shp'),
      type: 'shape',
      x: 40, y: 40,
      width: isLine ? 120 : 60,
      height: isLine ? 2 : 60,
      rotation: 0,
      props: {
        shape, fill: '#3b82f6', stroke: '#000000',
        strokeWidth: 0, borderRadius: shape === 'circle' ? 999 : 0,
        opacity: 1,
      },
      locked: false, visible: true, zIndex: nextZ,
    })
  }

  return (
    <div className="flex w-64 shrink-0 border-r bg-card">
      {/* Tab sidebar icons */}
      <div className="flex w-14 shrink-0 flex-col border-r bg-muted/50">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex flex-col items-center gap-0.5 px-1 py-3 text-[10px] transition-colors',
              activeTab === tab.id
                ? 'bg-background text-primary shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
          >
            <tab.icon className="size-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-y-auto p-3">
        {/* ── CARD OPTIONS ─────────────────────────────────────────── */}
        {activeTab === 'options' && (
          <CardOptionsPanel config={config} onConfigChange={onConfigChange} />
        )}

        {/* ── TEXT ──────────────────────────────────────────────────── */}
        {activeTab === 'text' && (
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Static Text
            </h3>
            <div className="flex flex-col gap-1.5">
              <button type="button" onClick={() => addStaticText(false)}
                className="flex items-center gap-2 rounded-lg border border-dashed p-2.5 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors">
                <TypeIcon className="size-3.5" /> Single Line Text
              </button>
              <button type="button" onClick={() => addStaticText(true)}
                className="flex items-center gap-2 rounded-lg border border-dashed p-2.5 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors">
                <TypeIcon className="size-3.5" /> Multi Line Text
              </button>
            </div>

            <Separator />

            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Dynamic Member Fields
            </h3>
            <p className="text-[10px] text-muted-foreground -mt-1">
              These auto-fill with member data during generation.
            </p>
            <div className="flex flex-col gap-1">
              {tableColumns && tableColumns.length > 0 ? (
                // ── Table-based fields: show text-type columns ──
                <>
                  {tableColumns
                    .filter((col) => tableColumnTypes?.[col] !== 'image')
                    .map((col) => (
                      <button
                        key={col}
                        type="button"
                        onClick={() => addDynamicField(col, col)}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      >
                        <span className="size-1.5 rounded-full bg-blue-400" />
                        {col}
                      </button>
                    ))}
                </>
              ) : (
                // ── Legacy fallback: hardcoded CardForge fields ──
                <>
                  {DYNAMIC_FIELDS.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => addDynamicField(f.key, f.label)}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <span className="size-1.5 rounded-full bg-blue-400" />
                      {f.label}
                    </button>
                  ))}
                </>
              )}
            </div>

            {/* Custom field input — only for legacy designs without table columns */}
            {(!tableColumns || tableColumns.length === 0) && (
              <>
                <Separator />

                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Custom Member Fields
                </h3>
                <p className="text-[10px] text-muted-foreground -mt-1">
                  Type a custom field key to bind to member data.
                </p>
                <div className="flex gap-1">
                  <input
                    type="text"
                    placeholder="e.g. bloodType"
                    className="flex-1 rounded-md border bg-transparent px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = (e.target as HTMLInputElement).value.trim()
                        if (val) {
                          addDynamicField(val, val)
                          ;(e.target as HTMLInputElement).value = ''
                        }
                      }
                    }}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* ── IMAGES ────────────────────────────────────────────────── */}
        {activeTab === 'images' && (
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Static Images
            </h3>
            <div className="flex flex-col gap-1.5">
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 rounded-lg border border-dashed p-2.5 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors">
                <ImageIcon className="size-3.5" /> Upload Image
              </button>
              <button type="button" onClick={addImagePlaceholder}
                className="flex items-center gap-2 rounded-lg border border-dashed p-2.5 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors">
                <PlusIcon className="size-3.5" /> Image Placeholder
              </button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUploadImage} />

            <Separator />

            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Dynamic Member Images
            </h3>
            <div className="flex flex-col gap-1">
              {tableColumns && tableColumns.length > 0 ? (
                // ── Table-based: show image-type columns ──
                <>
                  {tableColumns
                    .filter((col) => tableColumnTypes?.[col] === 'image')
                    .map((col) => (
                      <button
                        key={col}
                        type="button"
                        onClick={() => addDynamicImage(col)}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      >
                        <CameraIcon className="size-3 text-blue-500" />
                        {col}
                      </button>
                    ))}
                  {tableColumns.filter((col) => tableColumnTypes?.[col] === 'image').length === 0 && (
                    <p className="text-[10px] text-muted-foreground px-2">
                      No image columns defined. Edit the table to mark columns as image.
                    </p>
                  )}
                </>
              ) : (
                // ── Legacy fallback ──
                <>
                  {DYNAMIC_IMAGE_FIELDS.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => addDynamicImage(f.key)}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <span className="size-1.5 rounded-full bg-emerald-400" />
                      {f.label}
                    </button>
                  ))}
                </>
              )}
            </div>

            <Separator />

            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Codes
            </h3>
            <div className="flex flex-col gap-1.5">
              <button type="button" onClick={addQRCode}
                className="flex items-center gap-2 rounded-lg border border-dashed p-2.5 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors">
                <svg className="size-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm13-2h1v2h-3v-2h2zm-3 4h1v4h-1v-4zm4-4h2v2h-2v-2zm0 4h2v2h1v2h-3v-4zm-2 2h1v2h-1v-2z"/></svg>
                QR Code
              </button>
              <button type="button" onClick={addBarcode}
                className="flex items-center gap-2 rounded-lg border border-dashed p-2.5 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors">
                <svg className="size-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M2 4h2v16H2V4zm4 0h1v16H6V4zm2 0h2v16H8V4zm3 0h2v16h-2V4zm3 0h1v16h-1V4zm2 0h3v16h-3V4zm4 0h2v16h-2V4z"/></svg>
                Barcode
              </button>
            </div>
          </div>
        )}

        {/* ── SECURITY ──────────────────────────────────────────────── */}
        {activeTab === 'security' && (
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Security Features
            </h3>
            <p className="text-[10px] text-muted-foreground">
              Add security elements to help verify card authenticity.
            </p>

            <button type="button" onClick={addQRCode}
              className="flex items-center gap-2 rounded-lg border p-2.5 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors">
              <ShieldIcon className="size-3.5" /> Verification QR Code
            </button>
            <button type="button" onClick={addBarcode}
              className="flex items-center gap-2 rounded-lg border p-2.5 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors">
              <ShieldIcon className="size-3.5" /> ID Barcode
            </button>

            <Separator />

            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Coming Soon
            </h3>
            {['Hologram Overlay', 'Micro-text Pattern', 'UV Watermark'].map((item) => (
              <button key={item} type="button" disabled
                className="flex items-center gap-2 rounded-lg border p-2.5 text-xs text-muted-foreground opacity-40">
                <ShieldIcon className="size-3.5" /> {item}
                <span className="ml-auto text-[9px] uppercase">Soon</span>
              </button>
            ))}
          </div>
        )}

        {/* ── SHAPES ────────────────────────────────────────────────── */}
        {activeTab === 'shapes' && (
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Shapes
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {[
                { shape: 'rectangle', label: 'Rectangle', css: 'rounded-sm' },
                { shape: 'rounded-rect', label: 'Rounded', css: 'rounded-lg' },
                { shape: 'circle', label: 'Circle', css: 'rounded-full' },
                { shape: 'line', label: 'Line', css: 'rounded-none h-0.5 self-center' },
              ].map(({ shape, label, css }) => (
                <button
                  key={shape}
                  type="button"
                  onClick={() => addShape(shape)}
                  className="flex flex-col items-center gap-1 rounded-lg border p-2 text-[10px] text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
                >
                  <div className={cn('size-7 bg-muted-foreground/30', css)} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
