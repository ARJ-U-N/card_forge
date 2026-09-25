'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FileIcon,
  ImageIcon,
  Loader2Icon,
  PrinterIcon,
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
  type PrintConfig,
  type PaperSize,
  type PaperOrientation,
  type PrintMode,
  type PageLayout,
  type PrintPage,
} from '@/lib/print-layout'

interface Props {
  cards: RenderedCard[]
  cardOrientation: 'horizontal' | 'vertical'
  trigger: React.ReactElement
}

// Page dimensions for preview scaling
const PREVIEW_HEIGHT = 500

export function PrintLayoutDialog({ cards, cardOrientation, trigger }: Props) {
  const [config, setConfig] = useState<PrintConfig>(DEFAULT_PRINT_CONFIG)
  const [currentPage, setCurrentPage] = useState(1)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0, status: '' })
  const [cancelled, setCancelled] = useState(false)

  const update = <K extends keyof PrintConfig>(key: K, value: PrintConfig[K]) =>
    setConfig((prev) => ({ ...prev, [key]: value }))

  const updateMargin = (side: keyof PrintConfig['margins'], value: number) =>
    setConfig((prev) => ({ ...prev, margins: { ...prev.margins, [side]: value } }))

  // ── Layout calculation ────────────────────────────────────────────────
  const layout = useMemo(() => calculateLayout(config, cardOrientation), [config, cardOrientation])
  const pages = useMemo(() => distributeCards(cards, layout, config.printMode), [cards, layout, config.printMode])
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
      })

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
                      className={`flex-1 py-1 text-[10px] capitalize transition-colors ${config.orientation === o ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                      {o}
                    </button>
                  ))}
                </div>
              </Row>
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

            {/* Gutter & Grid */}
            <Section title="Grid">
              <Row label="Gutter (mm)">
                <Input type="number" min={0} max={20} value={config.gutter} className="h-7 text-xs"
                  onChange={(e) => update('gutter', Number(e.target.value))} />
              </Row>
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
                  <SelectItem value="duplex">Front + Back (Duplex)</SelectItem>
                  <SelectItem value="side-by-side">Front + Back (Side-by-Side)</SelectItem>
                </SelectContent>
              </Select>
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

            {/* Export buttons */}
            <div className="flex flex-col gap-1.5">
              <Button size="sm" onClick={handleExportPDF} disabled={exporting || cards.length === 0}>
                {exporting ? <Spinner data-icon="inline-start" /> : <FileIcon data-icon="inline-start" />}
                Export PDF
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

                  {/* Card slots */}
                  {currentPageData.cards.map(({ slot, card }, idx) => (
                    <div key={idx}>
                      {/* Front card image */}
                      <img
                        src={currentPageData.side === 'back' ? card.backDataUrl : card.frontDataUrl}
                        alt={card.memberName}
                        className="absolute"
                        style={{
                          left: slot.x * previewScale,
                          top: slot.y * previewScale,
                          width: slot.w * previewScale,
                          height: slot.h * previewScale,
                        }}
                        draggable={false}
                      />

                      {/* Card border */}
                      {config.cardBorders && (
                        <div className="absolute border border-gray-300" style={{
                          left: slot.x * previewScale,
                          top: slot.y * previewScale,
                          width: slot.w * previewScale,
                          height: slot.h * previewScale,
                        }} />
                      )}

                      {/* Crop marks (simplified preview) */}
                      {config.cropMarks && (
                        <>
                          <div className="absolute bg-black" style={{ left: (slot.x - 4) * previewScale, top: slot.y * previewScale, width: 3 * previewScale, height: 0.15 * previewScale }} />
                          <div className="absolute bg-black" style={{ left: slot.x * previewScale, top: (slot.y - 4) * previewScale, width: 0.15 * previewScale, height: 3 * previewScale }} />
                          <div className="absolute bg-black" style={{ left: (slot.x + slot.w + 1) * previewScale, top: slot.y * previewScale, width: 3 * previewScale, height: 0.15 * previewScale }} />
                          <div className="absolute bg-black" style={{ left: (slot.x + slot.w) * previewScale, top: (slot.y - 4) * previewScale, width: 0.15 * previewScale, height: 3 * previewScale }} />
                          <div className="absolute bg-black" style={{ left: (slot.x - 4) * previewScale, top: (slot.y + slot.h) * previewScale, width: 3 * previewScale, height: 0.15 * previewScale }} />
                          <div className="absolute bg-black" style={{ left: slot.x * previewScale, top: (slot.y + slot.h + 1) * previewScale, width: 0.15 * previewScale, height: 3 * previewScale }} />
                          <div className="absolute bg-black" style={{ left: (slot.x + slot.w + 1) * previewScale, top: (slot.y + slot.h) * previewScale, width: 3 * previewScale, height: 0.15 * previewScale }} />
                          <div className="absolute bg-black" style={{ left: (slot.x + slot.w) * previewScale, top: (slot.y + slot.h + 1) * previewScale, width: 0.15 * previewScale, height: 3 * previewScale }} />
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
                              left: (slot.x + slot.w + config.gutter) * previewScale,
                              top: slot.y * previewScale,
                              width: slot.w * previewScale,
                              height: slot.h * previewScale,
                            }}
                            draggable={false}
                          />
                          {config.cardBorders && (
                            <div className="absolute border border-gray-300" style={{
                              left: (slot.x + slot.w + config.gutter) * previewScale,
                              top: slot.y * previewScale,
                              width: slot.w * previewScale,
                              height: slot.h * previewScale,
                            }} />
                          )}
                        </>
                      )}
                    </div>
                  ))}
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
