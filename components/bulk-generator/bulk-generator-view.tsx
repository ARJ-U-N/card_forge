'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  CheckIcon,
  CheckSquareIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FolderIcon,
  ImageIcon,
  Loader2Icon,
  PaletteIcon,
  PrinterIcon,
  RefreshCwIcon,
  SearchIcon,
  SquareIcon,
  XIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/app/page-header'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { useAuth } from '@/components/providers/auth-provider'
import { usePortal } from '@/components/providers/portal-provider'
import { subscribeFolders } from '@/lib/firebase/folder-repository'
import { subscribeMembers, subscribeAllMembers } from '@/lib/firebase/member-repository'
import { subscribeDesigns } from '@/lib/firebase/design-repository'
import {
  renderCardsForMembers,
  summarizeBatch,
  downloadCard,
  downloadAllCards,
  type RenderedCard,
} from '@/lib/card-renderer'
import type { Design, Folder, Member } from '@/lib/models/types'
import { cn } from '@/lib/utils'
import { PrintLayoutDialog } from './print-layout-dialog'

const ROWS_OPTIONS = [8, 12, 20, 40]

export function BulkGeneratorView() {
  const { user } = useAuth()
  const { isPortalUser, portalFolderId } = usePortal()
  const workspaceId = user?.workspaceId ?? ''

  // Data
  const [folders, setFolders] = useState<Folder[]>([])
  const [designs, setDesigns] = useState<Design[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loadingData, setLoadingData] = useState(true)

  // Selectors
  // Portal users default to their folder; admins to __all__
  const [selectedFolderId, setSelectedFolderId] = useState<string>(
    isPortalUser && portalFolderId ? portalFolderId : '__all__',
  )
  const [selectedDesignId, setSelectedDesignId] = useState<string>('')

  // Search & pagination
  const [search, setSearch] = useState('')
  const [rowsPerPage, setRowsPerPage] = useState(12)
  const [currentPage, setCurrentPage] = useState(1)

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Generation
  const [cards, setCards] = useState<RenderedCard[]>([])
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [generationStatus, setGenerationStatus] = useState<string>('')
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const [failedCount, setFailedCount] = useState(0)

  // ── Load data ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!workspaceId) return
    setLoadingData(true)
    const unsubs = [
      subscribeFolders(workspaceId, setFolders),
      subscribeDesigns(workspaceId, (d) => {
        setDesigns(d)
        if (d.length > 0 && !selectedDesignId) setSelectedDesignId(d[0].id)
      }),
    ]
    setLoadingData(false)
    return () => unsubs.forEach((u) => u())
  }, [workspaceId])

  // Subscribe to members based on folder selection
  useEffect(() => {
    if (!workspaceId) return
    const unsub =
      selectedFolderId === '__all__'
        ? subscribeAllMembers(workspaceId, setMembers)
        : subscribeMembers(workspaceId, selectedFolderId, setMembers)
    return unsub
  }, [workspaceId, selectedFolderId])

  // Reset page when search/folder changes
  useEffect(() => setCurrentPage(1), [search, selectedFolderId, rowsPerPage])

  // ── Filtering & pagination ────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return members
    const q = search.toLowerCase()
    return members.filter(
      (m) =>
        m.firstName.toLowerCase().includes(q) ||
        m.lastName.toLowerCase().includes(q) ||
        m.employeeId.toLowerCase().includes(q) ||
        m.department.toLowerCase().includes(q),
    )
  }, [members, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage))
  const paginated = filtered.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage,
  )

  // ── Selection helpers ─────────────────────────────────────────────────
  const allOnPageSelected = paginated.length > 0 && paginated.every((m) => selectedIds.has(m.id))

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        paginated.forEach((m) => next.delete(m.id))
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        paginated.forEach((m) => next.add(m.id))
        return next
      })
    }
  }

  const deselectAll = () => setSelectedIds(new Set())

  // ── Get selected design ───────────────────────────────────────────────
  const selectedDesign = designs.find((d) => d.id === selectedDesignId) ?? null
  // Portal users see only their folder; admins see all
  const rootFolders = useMemo(() => {
    const roots = folders.filter((f) => !f.parentFolderId)
    if (isPortalUser && portalFolderId) {
      return roots.filter((f) => f.id === portalFolderId)
    }
    return roots
  }, [folders, isPortalUser, portalFolderId])

  // Portal users see only designs linked to their folder
  const filteredDesigns = useMemo(() => {
    if (isPortalUser && portalFolderId) {
      return designs.filter((d) => d.folderId === portalFolderId)
    }
    return designs
  }, [designs, isPortalUser, portalFolderId])

  // ── Generation ────────────────────────────────────────────────────────
  const generate = useCallback(
    async (memberList: Member[]) => {
      if (!selectedDesign) {
        toast.error('Please select a design first')
        return
      }
      if (memberList.length === 0) {
        toast.error('No members to generate')
        return
      }

      const controller = new AbortController()
      setAbortController(controller)
      setGenerating(true)
      setProgress({ current: 0, total: memberList.length })
      setGenerationStatus('Initializing…')
      setFailedCount(0)

      try {
        const results = await renderCardsForMembers(
          memberList,
          selectedDesign.cardConfiguration,
          selectedDesign.frontDocument,
          selectedDesign.backDocument,
          (current, total) => {
            setProgress({ current, total })
            setGenerationStatus(`Generating card ${current} of ${total}…`)
          },
          controller.signal,
        )

        if (controller.signal.aborted) {
          toast.info('Generation cancelled')
          setGenerationStatus('Cancelled')
          return
        }

        const summary = summarizeBatch(results)
        setCards(results)
        setFailedCount(summary.failed)
        setGenerationStatus('Complete')

        if (summary.failed > 0) {
          toast.warning(`Generated ${summary.succeeded} cards, ${summary.failed} failed`, {
            description: 'Check the grid for cards with error indicators.',
          })
        } else {
          toast.success(`Generated ${results.length} cards`, {
            description: 'Card previews are ready for review and download.',
          })
        }
      } catch (error) {
        console.error(error)
        toast.error('Generation failed', {
          description: error instanceof Error ? error.message : 'An error occurred during card generation.',
        })
        setGenerationStatus('Error')
      } finally {
        setGenerating(false)
        setAbortController(null)
      }
    },
    [selectedDesign],
  )

  const handleCancel = () => {
    abortController?.abort()
  }

  const handleGenerateAll = () => generate(filtered)
  const handleGenerateSelected = () => {
    const selectedMembers = filtered.filter((m) => selectedIds.has(m.id))
    generate(selectedMembers)
  }
  const handleRegenerate = () => {
    if (cards.length > 0) {
      const memberIds = cards.map((c) => c.memberId)
      const membersToRegen = members.filter((m) => memberIds.includes(m.id))
      generate(membersToRegen)
    }
  }

  const handleExportAll = () => {
    if (cards.length === 0) {
      toast.error('Generate cards first')
      return
    }
    downloadAllCards(cards)
    toast.success(`Downloading ${cards.length * 2} images…`)
  }

  const handleExportSelected = () => {
    const selected = cards.filter((c) => selectedIds.has(c.memberId))
    if (selected.length === 0) {
      toast.error('Select members to export')
      return
    }
    downloadAllCards(selected)
    toast.success(`Downloading ${selected.length * 2} images…`)
  }

  // ── Find card for a member ────────────────────────────────────────────
  const getCard = (memberId: string) => cards.find((c) => c.memberId === memberId)

  return (
    <>
      <PageHeader
        title="Bulk Generator"
        description="Generate individualized ID cards for all members in a folder."
      />

      {/* ── Header controls ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Folder selector */}
        <div className="flex items-center gap-1.5">
          <FolderIcon className="size-4 text-muted-foreground" />
          <Select value={selectedFolderId} onValueChange={(v) => { setSelectedFolderId(v); setCards([]) }}>
            <SelectTrigger className="w-44 h-9 text-xs">
              <SelectValue placeholder="Select folder" />
            </SelectTrigger>
            <SelectContent>
              {!isPortalUser && <SelectItem value="__all__">All Members</SelectItem>}
              {rootFolders.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Design selector */}
        <div className="flex items-center gap-1.5">
          <PaletteIcon className="size-4 text-muted-foreground" />
          <Select value={selectedDesignId} onValueChange={(v) => { setSelectedDesignId(v); setCards([]) }}>
            <SelectTrigger className="w-44 h-9 text-xs">
              <SelectValue placeholder="Select design" />
            </SelectTrigger>
            <SelectContent>
              {filteredDesigns.length === 0 ? (
                <SelectItem value="" disabled>No designs available</SelectItem>
              ) : (
                filteredDesigns.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <SearchIcon className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search members…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8 text-xs"
          />
        </div>

        <div className="flex-1" />

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          {cards.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={generating}>
              <RefreshCwIcon data-icon="inline-start" className={generating ? 'animate-spin' : ''} />
              Regenerate
            </Button>
          )}
          {cards.length > 0 && selectedDesign && (
            <PrintLayoutDialog
              cards={cards}
              cardOrientation={selectedDesign.cardConfiguration.orientation}
              trigger={
                <Button variant="outline" size="sm">
                  <PrinterIcon data-icon="inline-start" />
                  Print Layout
                </Button>
              }
            />
          )}
          <Button variant="outline" size="sm" onClick={handleExportSelected} disabled={selectedIds.size === 0 || generating}>
            <DownloadIcon data-icon="inline-start" />
            Export Selected ({selectedIds.size})
          </Button>
          <Button size="sm" onClick={handleGenerateAll} disabled={generating || filtered.length === 0 || !selectedDesign}>
            {generating ? <Spinner data-icon="inline-start" /> : <ImageIcon data-icon="inline-start" />}
            {generating ? 'Generating…' : 'Export All'}
          </Button>
        </div>
      </div>

      {/* ── Progress bar ─────────────────────────────────────────── */}
      {generating && (
        <div className="flex flex-col gap-1.5 rounded-lg border bg-card p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2Icon className="size-3.5 animate-spin" />
              {generationStatus}
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono tabular-nums">
                {progress.current}/{progress.total}
              </span>
              <Button variant="destructive" size="xs" onClick={handleCancel}>
                <XIcon data-icon="inline-start" />
                Cancel
              </Button>
            </div>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Selection bar ────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggleSelectAll}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {allOnPageSelected ? <CheckSquareIcon className="size-4 text-primary" /> : <SquareIcon className="size-4" />}
          {allOnPageSelected ? 'Deselect page' : 'Select page'}
        </button>

        {selectedIds.size > 0 && (
          <>
            <Badge variant="secondary" className="gap-1">
              {selectedIds.size} selected
            </Badge>
            <button type="button" onClick={deselectAll} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <XIcon className="size-3" /> Clear
            </button>
            <Button variant="outline" size="xs" onClick={handleGenerateSelected} disabled={generating}>
              Generate Selected
            </Button>
          </>
        )}

        <div className="flex-1" />

        {/* Rows per page */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Rows</span>
          <Select value={String(rowsPerPage)} onValueChange={(v) => setRowsPerPage(Number(v))}>
            <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROWS_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Record count */}
        <span className="text-xs text-muted-foreground">
          {filtered.length} member{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Card grid ────────────────────────────────────────────── */}
      {loadingData ? (
        <div className="flex items-center justify-center py-16">
          <Spinner className="size-6" />
        </div>
      ) : filtered.length === 0 ? (
        <Empty className="flex-1 border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon"><ImageIcon /></EmptyMedia>
            <EmptyTitle>
              {search.trim() ? `No members match "${search}"` : 'No members in this folder'}
            </EmptyTitle>
            <EmptyDescription>
              {search.trim()
                ? 'Try adjusting your search or selecting a different folder.'
                : 'Upload member data in the Data Upload module first.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {paginated.map((member) => {
            const card = getCard(member.id)
            const isSelected = selectedIds.has(member.id)

            return (
              <div
                key={member.id}
                className={cn(
                  'group relative rounded-xl border bg-card overflow-hidden transition-all',
                  isSelected && 'ring-2 ring-primary',
                )}
              >
                {/* Selection checkbox */}
                <button
                  type="button"
                  onClick={() => toggleSelect(member.id)}
                  className="absolute left-2 top-2 z-10 flex size-6 items-center justify-center rounded-md border bg-background/80 backdrop-blur-sm transition-colors hover:bg-primary/10"
                >
                  {isSelected ? (
                    <CheckIcon className="size-4 text-primary" />
                  ) : (
                    <SquareIcon className="size-4 text-muted-foreground" />
                  )}
                </button>

                {/* Card preview area */}
                <div className="relative bg-muted/30 p-3">
                  {card?.error ? (
                    <div className="flex h-24 items-center justify-center text-center">
                      <div className="rounded-md bg-destructive/10 px-3 py-2">
                        <p className="text-[10px] font-medium text-destructive">Render Failed</p>
                        <p className="text-[9px] text-muted-foreground mt-0.5">{card.error}</p>
                      </div>
                    </div>
                  ) : card ? (
                    <div className="flex gap-2 justify-center">
                      <div className="flex flex-col items-center gap-1">
                        <img
                          src={card.frontThumbUrl || card.frontDataUrl}
                          alt={`${card.memberName} front`}
                          className="h-24 rounded shadow-sm ring-1 ring-black/10"
                          draggable={false}
                          loading="lazy"
                        />
                        <span className="text-[9px] text-muted-foreground">Front</span>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <img
                          src={card.backThumbUrl || card.backDataUrl}
                          alt={`${card.memberName} back`}
                          className="h-24 rounded shadow-sm ring-1 ring-black/10"
                          draggable={false}
                          loading="lazy"
                        />
                        <span className="text-[9px] text-muted-foreground">Back</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-24 items-center justify-center">
                      <span className="text-xs text-muted-foreground">
                        Click &ldquo;Export All&rdquo; to generate
                      </span>
                    </div>
                  )}
                </div>

                {/* Member info */}
                <div className="flex items-center gap-2 border-t px-3 py-2">
                  {/* Avatar */}
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                    {member.profileImage ? (
                      <img src={member.profileImage} alt="" className="size-8 rounded-full object-cover" />
                    ) : (
                      <span>{(member.firstName[0] ?? '') + (member.lastName[0] ?? '')}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium">
                      {member.firstName} {member.lastName}
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {[member.title, member.department, member.employeeId].filter(Boolean).join(' · ') || 'No details'}
                    </p>
                  </div>

                  {/* Download */}
                  {card && !card.error && (
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => downloadCard(card, 'front')}
                        className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
                        title="Download front"
                      >
                        <DownloadIcon className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadCard(card, 'back')}
                        className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
                        title="Download back"
                      >
                        <DownloadIcon className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Pagination ───────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
          >
            <ChevronLeftIcon />
          </Button>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            Page{' '}
            <span className="font-medium text-foreground">{currentPage}</span>
            {' '}of{' '}
            <span className="font-medium text-foreground">{totalPages}</span>
          </div>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      )}
    </>
  )
}
