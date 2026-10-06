'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  Edit3Icon,
  FileIcon,
  ImageIcon,
  Loader2Icon,
  PrinterIcon,
  SaveIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { RenderedCard } from '@/lib/card-renderer'
import {
  calculateLayout,
  distributeCards,
  generatePDF,
  bulkExportImages,
  DEFAULT_PRINT_CONFIG,
  DEFAULT_SIDE_ADJUSTMENT,
  migratePrintConfig,
  type PrintConfig,
  type PaperSize,
  type PaperOrientation,
  type PrintMode,
  type LayoutMode,
  type DuplexBackArrangement,
  type SideAdjustment,
  type PageLayout,
  type PrintPage,
} from '@/lib/print-layout'
import { generateVectorPDF } from '@/lib/vector-pdf-renderer'
import { useAuth } from '@/components/providers/auth-provider'
import {
  createPrintPreset,
  updatePrintPreset,
  deletePrintPreset,
  subscribePrintPresets,
  type PrintPreset,
} from '@/lib/firebase/preset-repository'

interface Props {
  cards: RenderedCard[]
  cardOrientation: 'horizontal' | 'vertical'
  /** Physical card width in mm (from CardConfiguration). Defaults to CR-80. */
  cardWidthMm?: number
  /** Physical card height in mm (from CardConfiguration). Defaults to CR-80. */
  cardHeightMm?: number
  trigger: React.ReactElement
  /** Full Design object — required for vector PDF export */
  design?: import('@/lib/models/types').Design | null
  /** Member data — required for vector PDF export */
  members?: import('@/lib/models/types').Member[]
}

// Page dimensions for preview scaling
const PREVIEW_HEIGHT = 500

export function PrintLayoutDialog({ cards, cardOrientation, cardWidthMm, cardHeightMm, trigger, design, members }: Props) {
  const { user } = useAuth()
  const workspaceId = user?.workspaceId ?? ''

  const [config, setConfig] = useState<PrintConfig>(DEFAULT_PRINT_CONFIG)
  const [currentPage, setCurrentPage] = useState(1)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0, status: '' })
  const [cancelled, setCancelled] = useState(false)

  // ── Presets ──────────────────────────────────────────────────────────
  const [presets, setPresets] = useState<PrintPreset[]>([])
  const [presetName, setPresetName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  useEffect(() => {
    if (!workspaceId) return
    const unsub = subscribePrintPresets(workspaceId, setPresets)
    return unsub
  }, [workspaceId])

  const handleSavePreset = async () => {
    const name = presetName.trim()
    if (!name || !workspaceId) return
    try {
      await createPrintPreset(workspaceId, name, config)
      setPresetName('')
      toast.success(`Preset "${name}" saved`)
    } catch {
      toast.error('Failed to save preset')
    }
  }

  const handleApplyPreset = (preset: PrintPreset) => {
    // Merge with defaults so any new fields added in future phases are populated
    setConfig({ ...DEFAULT_PRINT_CONFIG, ...preset.config })
    toast.success(`Applied "${preset.name}"`)
  }

  const handleUpdatePreset = async (preset: PrintPreset) => {
    if (!workspaceId) return
    try {
      await updatePrintPreset(workspaceId, preset.id, { config })
      toast.success(`Updated "${preset.name}" with current settings`)
    } catch {
      toast.error('Failed to update preset')
    }
  }

  const handleRenamePreset = async (presetId: string) => {
    const name = renameValue.trim()
    if (!name || !workspaceId) return
    try {
      await updatePrintPreset(workspaceId, presetId, { name })
      setRenamingId(null)
      setRenameValue('')
      toast.success('Preset renamed')
    } catch {
      toast.error('Failed to rename preset')
    }
  }

  const handleDeletePreset = async (preset: PrintPreset) => {
    if (!workspaceId) return
    try {
      await deletePrintPreset(workspaceId, preset.id)
      toast.success(`Deleted "${preset.name}"`)
    } catch {
      toast.error('Failed to delete preset')
    }
  }

  const update = <K extends keyof PrintConfig>(key: K, value: PrintConfig[K]) =>
    setConfig((prev) => {
      const next = { ...prev, [key]: value }
      // Synchronize autoLayout when layoutMode changes
      if (key === 'layoutMode') {
        if (value === 'automatic') next.autoLayout = true
        else if (value === 'custom') next.autoLayout = false
        // 'rotated-90' uses its own auto-layout logic in the engine
      }
      return next
    })

  const updateMargin = (side: keyof PrintConfig['margins'], value: number) =>
    setConfig((prev) => ({ ...prev, margins: { ...prev.margins, [side]: value } }))

  const updateFrontAdj = (key: keyof SideAdjustment, value: number) =>
    setConfig((prev) => ({ ...prev, frontAdjustment: { ...prev.frontAdjustment, [key]: value } }))

  const updateBackAdj = (key: keyof SideAdjustment, value: number) =>
    setConfig((prev) => ({ ...prev, backAdjustment: { ...prev.backAdjustment, [key]: value } }))

  // ── Layout calculation ────────────────────────────────────────────────
  const customCardMm = useMemo(() => {
    if (cardWidthMm && cardHeightMm) return { w: cardWidthMm, h: cardHeightMm }
    return undefined
  }, [cardWidthMm, cardHeightMm])
  const layout = useMemo(() => calculateLayout(config, cardOrientation, customCardMm), [config, cardOrientation, customCardMm])
  const pages = useMemo(() => distributeCards(cards, layout, config.printMode, config.orientation, config.duplexBack), [cards, layout, config.printMode, config.orientation, config.duplexBack])
  const totalPages = pages.length
  const currentPageData = pages[currentPage - 1] ?? null

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(Math.max(1, totalPages))
  }, [totalPages, currentPage])

  // ── Preview scale ─────────────────────────────────────────────────────
  const previewScale = PREVIEW_HEIGHT / layout.pageH

  // ── Export PDF ────────────────────────────────────────────────────────
  const handleExportPDF = useCallback(async () => {
    setExporting(true)
    setCancelled(false)
    setExportProgress({ current: 0, total: totalPages, status: 'Starting…' })

    try {
      const blob = await generatePDF(cards, config, cardOrientation, (c, t, s) => {
        setExportProgress({ current: c, total: t, status: s })
      }, customCardMm)

      if (!cancelled) {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.download = `id-cards-${new Date().toISOString().slice(0, 10)}.pdf`
        link.href = url
        link.click()
        URL.revokeObjectURL(url)
        toast.success('PDF exported successfully', {
          description: `${totalPages} page${totalPages > 1 ? 's' : ''} with ${cards.length} cards.`,
        })
      }
    } catch (error) {
      console.error(error)
      toast.error('PDF export failed')
    } finally {
      setExporting(false)
    }
  }, [cards, config, cardOrientation, totalPages, cancelled])

  // ── Export Vector PDF ─────────────────────────────────────────────────
  const handleExportVectorPDF = useCallback(async () => {
    if (!design || !members || members.length === 0) {
      toast.error('Design and member data are required for vector PDF export')
      return
    }
    setExporting(true)
    setCancelled(false)
    setExportProgress({ current: 0, total: totalPages, status: 'Starting vector PDF…' })

    try {
      const blob = await generateVectorPDF({
        design,
        members,
        config,
        renderedCards: cards,
        onProgress: (c, t, s) => {
          setExportProgress({ current: c, total: t, status: s })
        },
      })

      if (!cancelled) {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.download = `id-cards-vector-${new Date().toISOString().slice(0, 10)}.pdf`
        link.href = url
        link.click()
        URL.revokeObjectURL(url)
        toast.success('Vector PDF exported successfully', {
          description: `${members.length} cards rendered as vector elements.`,
        })
      }
    } catch (error) {
      console.error(error)
      toast.error('Vector PDF export failed')
    } finally {
      setExporting(false)
    }
  }, [design, members, config, totalPages, cancelled, cards])

  // ── Export images ─────────────────────────────────────────────────────
  const handleExportImages = useCallback(async (format: 'png' | 'jpeg') => {
    setExporting(true)
    setExportProgress({ current: 0, total: cards.length * 2, status: `Exporting ${format.toUpperCase()}s…` })
    try {
      await bulkExportImages(cards, format, 'both', (c, t) => {
        setExportProgress({ current: c, total: t, status: `Exported ${c} of ${t}…` })
      })
      toast.success(`Exported ${cards.length * 2} ${format.toUpperCase()} files`)
    } catch {
      toast.error('Export failed')
    } finally {
      setExporting(false)
    }
  }, [cards])

  const handleCancel = () => {
    setCancelled(true)
    setExporting(false)
  }

  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-[90vw] lg:max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PrinterIcon className="size-4" />
            Print Layout & PDF Export
          </DialogTitle>
          <DialogDescription>
            Configure page layout and export {cards.length} cards as PDF or images.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col md:flex-row flex-1 gap-4 overflow-hidden min-h-0">
          {/* ── Left: Configuration ─────────────────────────────────── */}
          <div className="w-full md:w-64 shrink-0 overflow-y-auto flex flex-col gap-3 pr-2 max-h-[40vh] md:max-h-none">
            {/* Paper */}
            <Section title="Paper">
              <Row label="Size">
                <Select value={config.paperSize} onValueChange={(v) => update('paperSize', v as PaperSize)}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="a3">A3</SelectItem>
                    <SelectItem value="a4">A4</SelectItem>
                    <SelectItem value="letter">Letter</SelectItem>
                    <SelectItem value="legal">Legal</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
              <Row label="Orientation">
                <div className="flex rounded-md border">
                  {(['portrait', 'landscape'] as const).map((o) => (
                    <button key={o} type="button" onClick={() => update('orientation', o)}
                      disabled={config.layoutMode === 'rotated-90'}
                      className={`flex-1 py-1 text-[10px] capitalize transition-colors ${
                        (config.layoutMode === 'rotated-90' ? 'portrait' : config.orientation) === o
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-muted'
                      } ${config.layoutMode === 'rotated-90' ? 'cursor-not-allowed opacity-50' : ''}`}>
                      {o}
                    </button>
                  ))}
                </div>
                {config.layoutMode === 'rotated-90' && (
                  <p className="text-[9px] text-muted-foreground italic">Locked to Portrait in rotated mode</p>
                )}
              </Row>
            </Section>

            <Separator />

            {/* Card Layout Mode */}
            <Section title="Card Layout">
              <Select value={config.layoutMode} onValueChange={(v) => update('layoutMode', v as LayoutMode)}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="automatic">Automatic</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                  <SelectItem value="rotated-90">Rotate Cards 90°</SelectItem>
                </SelectContent>
              </Select>
              {config.layoutMode === 'rotated-90' && (
                <p className="text-[9px] text-muted-foreground">
                  Cards rotated 90° on portrait paper. Grid auto-calculated.
                </p>
              )}
            </Section>

            <Separator />

            {/* Margins */}
            <Section title="Margins (mm)">
              <div className="grid grid-cols-2 gap-1.5">
                {(['top', 'bottom', 'left', 'right'] as const).map((s) => (
                  <div key={s} className="flex flex-col gap-0.5">
                    <label className="text-[9px] text-muted-foreground capitalize">{s}</label>
                    <Input type="number" min={0} max={50} value={config.margins[s]} className="h-6 text-xs"
                      onChange={(e) => updateMargin(s, Number(e.target.value))} />
                  </div>
                ))}
              </div>
            </Section>

            <Separator />

            {/* Gaps & Grid */}
            <Section title="Grid">
              <div className="grid grid-cols-2 gap-1.5">
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] text-muted-foreground">H Gap (mm)</label>
                  <Input type="number" min={0} max={20} value={config.gutterH} className="h-6 text-xs"
                    onChange={(e) => update('gutterH', Number(e.target.value))} />
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] text-muted-foreground">V Gap (mm)</label>
                  <Input type="number" min={0} max={20} value={config.gutterV} className="h-6 text-xs"
                    onChange={(e) => update('gutterV', Number(e.target.value))} />
                </div>
              </div>
              {config.layoutMode !== 'rotated-90' && (
                <>
                  <div className="flex items-center gap-1.5">
                    <Checkbox id="autoLayout" checked={config.autoLayout}
                      onCheckedChange={(c) => update('autoLayout', c === true)} />
                    <label htmlFor="autoLayout" className="text-[10px]">Auto Layout</label>
                  </div>
                  {!config.autoLayout && (
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[9px] text-muted-foreground">Rows</label>
                        <Input type="number" min={1} max={10} value={config.rows} className="h-6 text-xs"
                          onChange={(e) => update('rows', Number(e.target.value))} />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[9px] text-muted-foreground">Columns</label>
                        <Input type="number" min={1} max={5} value={config.columns} className="h-6 text-xs"
                          onChange={(e) => update('columns', Number(e.target.value))} />
                      </div>
                    </div>
                  )}
                </>
              )}
            </Section>

            <Separator />

            {/* Guides */}
            <Section title="Guides">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <Checkbox id="cropMarks" checked={config.cropMarks}
                    onCheckedChange={(c) => update('cropMarks', c === true)} />
                  <label htmlFor="cropMarks" className="text-[10px]">Crop Marks</label>
                </div>
                <div className="flex items-center gap-1.5">
                  <Checkbox id="cardBorders" checked={config.cardBorders}
                    onCheckedChange={(c) => update('cardBorders', c === true)} />
                  <label htmlFor="cardBorders" className="text-[10px]">Card Borders</label>
                </div>
              </div>
            </Section>

            <Separator />

            {/* Print Mode */}
            <Section title="Print Mode">
              <Select value={config.printMode} onValueChange={(v) => update('printMode', v as PrintMode)}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="front-only">Front Only</SelectItem>
                  <SelectItem value="back-only">Back Only</SelectItem>
                  <SelectItem value="duplex">Front + Back (Duplex)</SelectItem>
                  <SelectItem value="side-by-side">Front + Back (Side-by-Side)</SelectItem>
                </SelectContent>
              </Select>
            </Section>

            {/* Back Side Arrangement — only in duplex mode */}
            {config.printMode === 'duplex' && (
              <>
                <Separator />
                <Section title="Back Side Arrangement">
                  <Select value={config.duplexBack} onValueChange={(v) => update('duplexBack', v as DuplexBackArrangement)}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="mirror-h">Mirror Horizontal</SelectItem>
                      <SelectItem value="mirror-v">Mirror Vertical</SelectItem>
                      <SelectItem value="rotate-180">Rotate 180°</SelectItem>
                      <SelectItem value="rotate-page-180">Rotate Back Page 180°</SelectItem>
                    </SelectContent>
                  </Select>
                  {config.duplexBack === 'rotate-page-180' ? (
                    <p className="text-[9px] text-muted-foreground">
                      Rotates the entire back page 180°. Use after physically rotating the printed front sheet 180° before printing the back.
                    </p>
                  ) : (
                    <p className="text-[9px] text-muted-foreground">
                      Match your printer’s duplex flip direction.
                    </p>
                  )}
                </Section>
              </>
            )}

            <Separator />

            {/* Fine Adjustment — Front Side */}
            <Section title="Front Side Adjustment">
              <div className="grid grid-cols-3 gap-1.5">
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] text-muted-foreground">X (mm)</label>
                  <Input type="number" step={0.1} value={config.frontAdjustment.offsetX} className="h-6 text-xs"
                    onChange={(e) => updateFrontAdj('offsetX', Number(e.target.value))} />
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] text-muted-foreground">Y (mm)</label>
                  <Input type="number" step={0.1} value={config.frontAdjustment.offsetY} className="h-6 text-xs"
                    onChange={(e) => updateFrontAdj('offsetY', Number(e.target.value))} />
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] text-muted-foreground">Rot (°)</label>
                  <Input type="number" step={0.1} value={config.frontAdjustment.rotation} className="h-6 text-xs"
                    onChange={(e) => updateFrontAdj('rotation', Number(e.target.value))} />
                </div>
              </div>
            </Section>

            {/* Fine Adjustment — Back Side */}
            <Section title="Back Side Adjustment">
              <div className="grid grid-cols-3 gap-1.5">
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] text-muted-foreground">X (mm)</label>
                  <Input type="number" step={0.1} value={config.backAdjustment.offsetX} className="h-6 text-xs"
                    onChange={(e) => updateBackAdj('offsetX', Number(e.target.value))} />
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] text-muted-foreground">Y (mm)</label>
                  <Input type="number" step={0.1} value={config.backAdjustment.offsetY} className="h-6 text-xs"
                    onChange={(e) => updateBackAdj('offsetY', Number(e.target.value))} />
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] text-muted-foreground">Rot (°)</label>
                  <Input type="number" step={0.1} value={config.backAdjustment.rotation} className="h-6 text-xs"
                    onChange={(e) => updateBackAdj('rotation', Number(e.target.value))} />
                </div>
              </div>
            </Section>

            <Separator />

            {/* Info */}
            <div className="rounded-lg bg-muted/50 p-2 text-[10px] text-muted-foreground space-y-1">
              <div className="flex justify-between"><span>Cards/Page:</span> <span className="font-medium text-foreground">{layout.cardsPerPage}</span></div>
              <div className="flex justify-between"><span>Grid:</span> <span className="font-medium text-foreground">{layout.rows}×{layout.cols}</span></div>
              <div className="flex justify-between"><span>Total Pages:</span> <span className="font-medium text-foreground">{totalPages}</span></div>
              <div className="flex justify-between"><span>Card Size:</span> <span className="font-medium text-foreground">{layout.cardW.toFixed(1)}×{layout.cardH.toFixed(1)}mm</span></div>
            </div>

            <Separator />

            {/* Presets */}
            <Section title="Presets">
              {/* Save new */}
              <div className="flex gap-1">
                <Input
                  placeholder="Preset name…"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  className="h-6 text-xs flex-1"
                  onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
                />
                <Button variant="outline" size="icon-sm" onClick={handleSavePreset} disabled={!presetName.trim() || !workspaceId}
                  title="Save current settings as preset">
                  <SaveIcon className="size-3" />
                </Button>
              </div>
              {/* List */}
              {presets.length > 0 && (
                <div className="flex flex-col gap-1 max-h-28 overflow-y-auto">
                  {presets.map((p) => (
                    <div key={p.id} className="flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] group hover:bg-muted/50">
                      {renamingId === p.id ? (
                        <form className="flex gap-1 flex-1" onSubmit={(e) => { e.preventDefault(); handleRenamePreset(p.id) }}>
                          <Input
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            className="h-5 text-[10px] flex-1"
                            autoFocus
                          />
                          <Button variant="outline" size="icon-sm" type="submit" className="h-5 w-5">
                            <SaveIcon className="size-2.5" />
                          </Button>
                          <Button variant="ghost" size="icon-sm" type="button" className="h-5 w-5" onClick={() => setRenamingId(null)}>
                            <XIcon className="size-2.5" />
                          </Button>
                        </form>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleApplyPreset(p)}
                            className="flex-1 text-left truncate font-medium hover:text-primary transition-colors"
                            title={`Apply "${p.name}"`}
                          >
                            {p.name}
                          </button>
                          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button type="button" onClick={() => handleUpdatePreset(p)} className="rounded p-0.5 hover:bg-muted" title="Overwrite with current settings">
                              <SaveIcon className="size-2.5 text-muted-foreground" />
                            </button>
                            <button type="button" onClick={() => { setRenamingId(p.id); setRenameValue(p.name) }} className="rounded p-0.5 hover:bg-muted" title="Rename">
                              <Edit3Icon className="size-2.5 text-muted-foreground" />
                            </button>
                            <button type="button" onClick={() => handleDeletePreset(p)} className="rounded p-0.5 hover:bg-destructive/10" title="Delete">
                              <Trash2Icon className="size-2.5 text-destructive" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Separator />
            <div className="flex flex-col gap-1.5">
              <Button size="sm" onClick={handleExportPDF} disabled={exporting || cards.length === 0}>
                {exporting ? <Spinner data-icon="inline-start" /> : <FileIcon data-icon="inline-start" />}
                Export PDF
              </Button>
              <Button size="sm" variant="secondary" onClick={handleExportVectorPDF} disabled={exporting || !design || !members || members.length === 0}>
                {exporting ? <Spinner data-icon="inline-start" /> : <FileIcon data-icon="inline-start" />}
                Export PDF (Vector)
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExportImages('png')} disabled={exporting}>
                <ImageIcon data-icon="inline-start" /> Export PNGs
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExportImages('jpeg')} disabled={exporting}>
                <ImageIcon data-icon="inline-start" /> Export JPEGs
              </Button>
              {exporting && (
                <Button variant="destructive" size="sm" onClick={handleCancel}>
                  <XIcon data-icon="inline-start" /> Cancel
                </Button>
              )}
            </div>
          </div>

          {/* ── Right: Preview ─────────────────────────────────────── */}
          <div className="flex flex-1 flex-col min-w-0">
            {/* Progress */}
            {exporting && (
              <div className="mb-3 flex flex-col gap-1 rounded-lg border p-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Loader2Icon className="size-3 animate-spin" />
                    {exportProgress.status}
                  </span>
                  <span className="font-mono tabular-nums text-[10px]">{exportProgress.current}/{exportProgress.total}</span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${exportProgress.total > 0 ? (exportProgress.current / exportProgress.total) * 100 : 0}%` }} />
                </div>
              </div>
            )}

            {/* Page preview */}
            <div className="flex flex-1 items-center justify-center overflow-hidden bg-muted/20 rounded-lg p-4">
              {currentPageData ? (
                <div
                  className="relative bg-white shadow-xl ring-1 ring-black/10 rounded-sm"
                  style={{
                    width: layout.pageW * previewScale,
                    height: layout.pageH * previewScale,
                  }}
                >
                  {/* Page side label */}
                  <div className="absolute -top-5 left-0 text-[9px] text-muted-foreground">
                    Page {currentPage} — {currentPageData.side === 'back' ? 'Back Side' : 'Front Side'}
                  </div>

                  {/* Card slots — wrapped for page-level 180° rotation preview */}
                  <div style={{
                    width: '100%',
                    height: '100%',
                    ...(currentPageData.side === 'back' && config.duplexBack === 'rotate-page-180' ? {
                      transform: 'rotate(180deg)',
                    } : {}),
                  }}>
                  {currentPageData.cards.map(({ slot, card }, idx) => {
                    const adj = currentPageData.side === 'back' ? config.backAdjustment : config.frontAdjustment
                    const adjX = adj.offsetX * previewScale
                    const adjY = adj.offsetY * previewScale
                    const adjRot = adj.rotation
                    return (
                    <div key={idx} style={{
                      ...(adjRot !== 0 ? {
                        transform: `rotate(${adjRot}deg)`,
                        transformOrigin: `${layout.pageW * previewScale / 2}px ${layout.pageH * previewScale / 2}px`,
                      } : {}),
                    }}>
                      {/* Card image */}
                      <img
                        src={currentPageData.side === 'back' ? card.backDataUrl : card.frontDataUrl}
                        alt={card.memberName}
                        className="absolute"
                        style={{
                          left: slot.x * previewScale + adjX,
                          top: slot.y * previewScale + adjY,
                          width: slot.w * previewScale,
                          height: slot.h * previewScale,
                          ...(layout.rotateCards ? {
                            transformOrigin: 'top left',
                            transform: `translate(${slot.w * previewScale}px, 0px) rotate(90deg)`,
                            width: slot.h * previewScale,
                            height: slot.w * previewScale,
                          } : {}),
                        }}
                        draggable={false}
                      />

                      {config.cardBorders && (
                        <div className="absolute border border-gray-300" style={{
                          left: slot.x * previewScale + adjX,
                          top: slot.y * previewScale + adjY,
                          width: slot.w * previewScale,
                          height: slot.h * previewScale,
                        }} />
                      )}

                      {/* Crop marks (simplified preview) */}
                      {config.cropMarks && (
                        <>
                          <div className="absolute bg-black" style={{ left: (slot.x - 4) * previewScale + adjX, top: slot.y * previewScale + adjY, width: 3 * previewScale, height: 0.15 * previewScale }} />
                          <div className="absolute bg-black" style={{ left: slot.x * previewScale + adjX, top: (slot.y - 4) * previewScale + adjY, width: 0.15 * previewScale, height: 3 * previewScale }} />
                          <div className="absolute bg-black" style={{ left: (slot.x + slot.w + 1) * previewScale + adjX, top: slot.y * previewScale + adjY, width: 3 * previewScale, height: 0.15 * previewScale }} />
                          <div className="absolute bg-black" style={{ left: (slot.x + slot.w) * previewScale + adjX, top: (slot.y - 4) * previewScale + adjY, width: 0.15 * previewScale, height: 3 * previewScale }} />
                          <div className="absolute bg-black" style={{ left: (slot.x - 4) * previewScale + adjX, top: (slot.y + slot.h) * previewScale + adjY, width: 3 * previewScale, height: 0.15 * previewScale }} />
                          <div className="absolute bg-black" style={{ left: slot.x * previewScale + adjX, top: (slot.y + slot.h + 1) * previewScale + adjY, width: 0.15 * previewScale, height: 3 * previewScale }} />
                          <div className="absolute bg-black" style={{ left: (slot.x + slot.w + 1) * previewScale + adjX, top: (slot.y + slot.h) * previewScale + adjY, width: 3 * previewScale, height: 0.15 * previewScale }} />
                          <div className="absolute bg-black" style={{ left: (slot.x + slot.w) * previewScale + adjX, top: (slot.y + slot.h + 1) * previewScale + adjY, width: 0.15 * previewScale, height: 3 * previewScale }} />
                        </>
                      )}

                      {/* Side-by-side back */}
                      {config.printMode === 'side-by-side' && (
                        <>
                          <img
                            src={card.backDataUrl}
                            alt={`${card.memberName} back`}
                            className="absolute"
                            style={{
                              left: (slot.x + slot.w + config.gutterH) * previewScale + config.backAdjustment.offsetX * previewScale,
                              top: slot.y * previewScale + config.backAdjustment.offsetY * previewScale,
                              width: slot.w * previewScale,
                              height: slot.h * previewScale,
                              ...(layout.rotateCards ? {
                                transformOrigin: 'top left',
                                transform: `translate(${slot.w * previewScale}px, 0px) rotate(90deg)`,
                                width: slot.h * previewScale,
                                height: slot.w * previewScale,
                              } : {}),
                            }}
                            draggable={false}
                          />
                          {config.cardBorders && (
                            <div className="absolute border border-gray-300" style={{
                              left: (slot.x + slot.w + config.gutterH) * previewScale + config.backAdjustment.offsetX * previewScale,
                              top: slot.y * previewScale + config.backAdjustment.offsetY * previewScale,
                              width: slot.w * previewScale,
                              height: slot.h * previewScale,
                            }} />
                          )}
                        </>
                      )}
                    </div>
                    )
                  })}
                  </div>  {/* end page-rotation wrapper */}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No cards to preview</div>
              )}
            </div>

            {/* Page nav */}
            <div className="flex items-center justify-center gap-3 pt-3">
              <Button variant="outline" size="icon-sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}>
                <ChevronLeftIcon />
              </Button>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                Page <span className="font-medium text-foreground">{currentPage}</span>
                of <span className="font-medium text-foreground">{totalPages || 1}</span>
                <span className="mx-1">·</span>
                <span>{layout.cardsPerPage} cards/page</span>
              </div>
              <Button variant="outline" size="icon-sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>
                <ChevronRightIcon />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{title}</h4>
      {children}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[10px] text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}
