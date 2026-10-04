'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  EyeIcon,
  SaveIcon,
  UsersIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useAuth } from '@/components/providers/auth-provider'
import { usePortal } from '@/components/providers/portal-provider'
import { getDesign, updateDesign } from '@/lib/firebase/design-repository'
import { getFolder } from '@/lib/firebase/folder-repository'
import type {
  CardConfiguration,
  CardDocument,
  CanvasElement,
  ColumnRoles,
  Design,
  Folder,
  Member,
} from '@/lib/models/types'
import { LeftPanel } from './panels/left-panel'
import { RightPanel } from './panels/right-panel'
import { CardCanvas } from './canvas/card-canvas'
import { getMembersInFolder } from '@/lib/firebase/member-repository'

interface Props {
  designId: string
}

let _dupCounter = 0

export function CardDesigner({ designId }: Props) {
  const { user } = useAuth()
  const { isPortalUser, portalFolderId } = usePortal()
  const workspaceId = user?.workspaceId ?? ''

  const [design, setDesign] = useState<Design | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [name, setName] = useState('')
  const [draftRestored, setDraftRestored] = useState(false)

  // Linked folder (for table-based dynamic fields)
  const [linkedFolder, setLinkedFolder] = useState<Folder | null>(null)

  // Editor state
  const [activeSide, setActiveSide] = useState<'front' | 'back'>('front')
  const [zoom, setZoom] = useState(100)
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [config, setConfig] = useState<CardConfiguration | null>(null)
  const [frontDoc, setFrontDoc] = useState<CardDocument>({ elements: [], background: '#ffffff' })
  const [backDoc, setBackDoc] = useState<CardDocument>({ elements: [], background: '#ffffff' })

  // ── Max Length Text — Designer-only preview state (never persisted) ──
  const [members, setMembers] = useState<Member[]>([])
  const [maxLengthPreviewIds, setMaxLengthPreviewIds] = useState<Set<string>>(new Set())

  // ── Undo / Redo — Designer-session-only (never persisted) ───────────────
  const frontDocRef = useRef(frontDoc)
  const backDocRef = useRef(backDoc)
  const undoStackRef = useRef<{ front: CardDocument; back: CardDocument }[]>([])
  const redoStackRef = useRef<{ front: CardDocument; back: CardDocument }[]>([])
  const panelSnapshotTakenRef = useRef(false)
  const panelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Draft constants ──
  const DRAFT_KEY = `cardforge-designer-draft-${designId}`
  const DRAFT_VERSION = 1

  // Load design (and restore draft if one exists)
  useEffect(() => {
    if (!workspaceId || !designId) return
    setLoading(true)
    getDesign(workspaceId, designId).then(async (d) => {
      if (d) {
        setDesign(d)
        setName(d.name)
        setConfig(d.cardConfiguration)
        setFrontDoc(d.frontDocument)
        setBackDoc(d.backDocument)

        // Check localStorage for a draft
        try {
          const raw = localStorage.getItem(DRAFT_KEY)
          if (raw) {
            const draft = JSON.parse(raw)
            if (
              draft &&
              draft.designId === designId &&
              draft.version === DRAFT_VERSION &&
              draft.config &&
              draft.frontDocument &&
              draft.backDocument
            ) {
              setName(draft.name ?? d.name)
              setConfig(draft.config)
              setFrontDoc(draft.frontDocument)
              setBackDoc(draft.backDocument)
              setDraftRestored(true)
              toast.info('Unsaved draft restored', {
                description: 'Your previous unsaved changes have been restored from local storage.',
              })
            } else {
              localStorage.removeItem(DRAFT_KEY)
            }
          }
        } catch {
          // Invalid JSON — remove and continue with saved design
          localStorage.removeItem(DRAFT_KEY)
        }

        // Load the linked folder for table-based dynamic fields
        if (d.folderId) {
          const f = await getFolder(workspaceId, d.folderId)
          setLinkedFolder(f)
        }
      }
      setLoading(false)
    })
  }, [workspaceId, designId])

  // Load members from the linked folder for Max Length Text preview
  useEffect(() => {
    if (!workspaceId || !design?.folderId) return
    getMembersInFolder(workspaceId, design.folderId).then(setMembers).catch(() => {})
  }, [workspaceId, design?.folderId])

  const activeDoc = activeSide === 'front' ? frontDoc : backDoc
  const setActiveDoc = activeSide === 'front' ? setFrontDoc : setBackDoc

  // ── Draft: debounced write to localStorage (1s after last state change) ──
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    // Don't write drafts while still loading the design
    if (loading || !config) return
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    draftTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          designId,
          version: DRAFT_VERSION,
          savedAt: new Date().toISOString(),
          name,
          config,
          frontDocument: frontDoc,
          backDocument: backDoc,
        }))
      } catch {
        // Quota exceeded or other error — fail silently
      }
    }, 1000)
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current) }
  }, [name, config, frontDoc, backDoc, designId, loading])

  // Keep refs in sync with latest state (updated after each render)
  useEffect(() => { frontDocRef.current = frontDoc }, [frontDoc])
  useEffect(() => { backDocRef.current = backDoc }, [backDoc])

  // Capture current state to undo stack (refs hold pre-edit values)
  const pushUndo = useCallback(() => {
    undoStackRef.current = [...undoStackRef.current.slice(-49), { front: frontDocRef.current, back: backDocRef.current }]
    redoStackRef.current = []
  }, [])

  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return
    redoStackRef.current.push({ front: frontDocRef.current, back: backDocRef.current })
    const prev = undoStackRef.current.pop()!
    setFrontDoc(prev.front)
    setBackDoc(prev.back)
  }, [])

  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return
    undoStackRef.current.push({ front: frontDocRef.current, back: backDocRef.current })
    const next = redoStackRef.current.pop()!
    setFrontDoc(next.front)
    setBackDoc(next.back)
  }, [])

  // ── Save ──────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!config) return
    setSaving(true)
    setSaved(false)
    try {
      await updateDesign(workspaceId, designId, {
        name,
        cardConfiguration: config,
        frontDocument: frontDoc,
        backDocument: backDoc,
      })
      // Clear draft on successful save
      try { localStorage.removeItem(DRAFT_KEY) } catch {}
      setDraftRestored(false)
      setSaved(true)
      toast.success('Design saved successfully', {
        description: `"${name}" has been saved with all elements and configuration.`,
      })
      setTimeout(() => setSaved(false), 3000)
    } catch {
      toast.error('Failed to save design', {
        description: 'Please check your connection and try again.',
      })
    } finally {
      setSaving(false)
    }
  }

  // ── Zoom ──────────────────────────────────────────────────────────────
  const handleZoomIn = () => setZoom((z) => Math.min(200, z + 10))
  const handleZoomOut = () => setZoom((z) => Math.max(30, z - 10))

  // ── Element operations ────────────────────────────────────────────────
  const handleUpdateElement = useCallback(
    (id: string, updates: Partial<CanvasElement>) => {
      setActiveDoc((prev) => ({
        ...prev,
        elements: prev.elements.map((el) =>
          el.id === id ? { ...el, ...updates } : el,
        ),
      }))
    },
    [activeSide],
  )

  // Property-panel variant: debounced undo snapshot so rapid edits
  // (typing numbers, dragging color picker) create one undo entry.
  const handleUpdateElementWithUndo = useCallback(
    (id: string, updates: Partial<CanvasElement>) => {
      if (!panelSnapshotTakenRef.current) {
        pushUndo()
        panelSnapshotTakenRef.current = true
      }
      if (panelTimerRef.current) clearTimeout(panelTimerRef.current)
      panelTimerRef.current = setTimeout(() => { panelSnapshotTakenRef.current = false }, 500)
      handleUpdateElement(id, updates)
    },
    [handleUpdateElement, pushUndo],
  )

  const handleAddElement = useCallback(
    (element: CanvasElement) => {
      pushUndo()
      setActiveDoc((prev) => ({
        ...prev,
        elements: [...prev.elements, element],
      }))
      setSelectedElementId(element.id)
    },
    [activeSide, pushUndo],
  )

  const handleDeleteElement = useCallback(
    (id: string) => {
      pushUndo()
      setActiveDoc((prev) => ({
        ...prev,
        elements: prev.elements.filter((el) => el.id !== id),
      }))
      if (selectedElementId === id) setSelectedElementId(null)
    },
    [activeSide, selectedElementId, pushUndo],
  )

  const handleDuplicateElement = useCallback(
    (id: string) => {
      pushUndo()
      setActiveDoc((prev) => {
        const source = prev.elements.find((el) => el.id === id)
        if (!source) return prev
        const clone: CanvasElement = {
          ...source,
          id: `dup-${Date.now()}-${++_dupCounter}`,
          x: source.x + 15,
          y: source.y + 15,
          zIndex: prev.elements.length + 1,
          props: { ...source.props },
        }
        setSelectedElementId(clone.id)
        return { ...prev, elements: [...prev.elements, clone] }
      })
    },
    [activeSide, pushUndo],
  )

  const handleReorderElement = useCallback(
    (id: string, direction: 'up' | 'down') => {
      pushUndo()
      setActiveDoc((prev) => {
        const sorted = [...prev.elements].sort((a, b) => a.zIndex - b.zIndex)
        const idx = sorted.findIndex((el) => el.id === id)
        if (idx === -1) return prev
        const swapIdx = direction === 'up' ? idx + 1 : idx - 1
        if (swapIdx < 0 || swapIdx >= sorted.length) return prev

        const elZ = sorted[idx].zIndex
        const swapZ = sorted[swapIdx].zIndex

        return {
          ...prev,
          elements: prev.elements.map((el) => {
            if (el.id === id) return { ...el, zIndex: swapZ }
            if (el.id === sorted[swapIdx].id) return { ...el, zIndex: elZ }
            return el
          }),
        }
      })
    },
    [activeSide, pushUndo],
  )

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable
      const key = e.key.toLowerCase()

      // Undo: Ctrl+Z / Cmd+Z (without Shift)
      if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
        if (isEditable) return // let native input undo work
        e.preventDefault()
        undo()
        return
      }
      // Redo: Ctrl+Y / Cmd+Y or Ctrl+Shift+Z / Cmd+Shift+Z
      if ((e.ctrlKey || e.metaKey) && (key === 'y' || (key === 'z' && e.shiftKey))) {
        if (isEditable) return // let native input redo work
        e.preventDefault()
        redo()
        return
      }

      if (!selectedElementId) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (isEditable) return
        // Don't delete locked elements
        const el = activeDoc.elements.find((el) => el.id === selectedElementId)
        if (el?.locked) return
        handleDeleteElement(selectedElementId)
      }
      if (e.key === 'Escape') setSelectedElementId(null)
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault()
        handleDuplicateElement(selectedElementId)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedElementId, handleDeleteElement, handleDuplicateElement, activeDoc, undo, redo])

  // ── Loading / Not found ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-3">
        <Spinner className="size-6" />
        <span className="text-sm text-muted-foreground">Loading design…</span>
      </div>
    )
  }

  if (!design || !config) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Design not found.</p>
        <Button variant="outline" nativeButton={false} render={<Link href="/designer" />}>
          <ArrowLeftIcon data-icon="inline-start" />
          Back to Designer
        </Button>
      </div>
    )
  }

  // Portal access control: deny if design is linked to a different folder
  if (isPortalUser && portalFolderId && design.folderId && design.folderId !== portalFolderId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <p className="text-lg font-semibold">No Permission</p>
        <p className="text-sm text-muted-foreground max-w-sm text-center">
          You do not have access to this design. Your portal is restricted to your assigned College only.
        </p>
        <Button variant="outline" nativeButton={false} render={<Link href="/designer" />}>
          <ArrowLeftIcon data-icon="inline-start" />
          Back to Designer
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden -m-6">
      {/* ── Top toolbar ──────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b bg-card px-4 py-2 shrink-0">
        <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href="/designer/my-designs" />}>
          <ArrowLeftIcon />
        </Button>

        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-8 w-48 border-none bg-transparent text-sm font-medium shadow-none focus-visible:ring-1"
        />

        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/data-upload" />}>
          <UsersIcon data-icon="inline-start" />
          View Members
        </Button>
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/bulk-generator" />}>
          <EyeIcon data-icon="inline-start" />
          All Previews
        </Button>

        <div className="flex-1" />

        {/* Front / Back toggle */}
        <div className="flex items-center rounded-lg border bg-muted p-0.5">
          {(['front', 'back'] as const).map((side) => (
            <button
              key={side}
              type="button"
              onClick={() => { setActiveSide(side); setSelectedElementId(null) }}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${activeSide === side
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              {side}
            </button>
          ))}
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-0.5 rounded-lg border px-1">
          <Button variant="ghost" size="icon-xs" onClick={handleZoomOut}><ZoomOutIcon /></Button>
          <button type="button" className="min-w-[4ch] text-center text-xs tabular-nums" onClick={() => setZoom(100)}>
            {zoom}%
          </button>
          <Button variant="ghost" size="icon-xs" onClick={handleZoomIn}><ZoomInIcon /></Button>
        </div>

        {/* Save */}
        {draftRestored && (
          <span className="text-[10px] text-amber-500 font-medium animate-pulse">Unsaved draft</span>
        )}
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? (
            <Spinner data-icon="inline-start" />
          ) : saved ? (
            <CheckCircleIcon data-icon="inline-start" className="text-green-500" />
          ) : (
            <SaveIcon data-icon="inline-start" />
          )}
          {saving ? 'Saving…' : saved ? 'Saved!' : 'Save'}
        </Button>
      </div>

      {/* ── Three-column editor ──────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        <LeftPanel
          config={config}
          onConfigChange={setConfig}
          activeDoc={activeDoc}
          activeSide={activeSide}
          onAddElement={handleAddElement}
          tableColumns={linkedFolder?.tableColumns}
          tableColumnTypes={linkedFolder?.tableColumnTypes}
          tableColumnRoles={linkedFolder?.tableColumnRoles}
        />

        <div className="flex flex-1 items-center justify-center bg-muted/30 overflow-auto p-6">
          <CardCanvas
            config={config}
            document={activeDoc}
            zoom={zoom}
            selectedElementId={selectedElementId}
            onSelectElement={setSelectedElementId}
            onUpdateElement={handleUpdateElement}
            onBeforeChange={pushUndo}
            maxLengthPreviewIds={maxLengthPreviewIds}
            members={members}
          />
        </div>

        <RightPanel
          activeDoc={activeDoc}
          selectedElementId={selectedElementId}
          onSelectElement={setSelectedElementId}
          onUpdateElement={handleUpdateElementWithUndo}
          onDeleteElement={handleDeleteElement}
          onDuplicateElement={handleDuplicateElement}
          onReorderElement={handleReorderElement}
          tableColumns={linkedFolder?.tableColumns}
          tableColumnRoles={linkedFolder?.tableColumnRoles}
          maxLengthPreviewIds={maxLengthPreviewIds}
          onToggleMaxLengthPreview={(id) =>
            setMaxLengthPreviewIds((prev) => {
              const next = new Set(prev)
              if (next.has(id)) next.delete(id)
              else next.add(id)
              return next
            })
          }
        />
      </div>
    </div>
  )
}
