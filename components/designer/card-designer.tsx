'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  RefreshCwIcon,
  SaveIcon,
  UsersIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
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
import { getTableNameColumn, getMemberDisplayName } from '@/lib/models/types'
import { LeftPanel } from './panels/left-panel'
import { RightPanel } from './panels/right-panel'
import { CardCanvas, visualCardSize } from './canvas/card-canvas'
import { getMembersInFolder } from '@/lib/firebase/member-repository'
import { resolveDynamicText } from '@/lib/card-renderer'
import { createResolutionSession, isResolved } from '@/lib/local-photos/local-photo-resolver'
import type { PhotoResolutionResult } from '@/lib/local-photos/local-photo-resolver'

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

  // ── Linked Width/Height — editing aid for circle dynamic images (never persisted) ──
  const [sizeLocked, setSizeLocked] = useState(true)

  // ── Member Photo Preview — transient preview state (never persisted) ──
  const [previewMemberId, setPreviewMemberId] = useState<string | null>(null)
  const [previewImageSources, setPreviewImageSources] = useState<Record<string, string>>({})
  const [previewLoading, setPreviewLoading] = useState(false)
  const [refreshCounter, setRefreshCounter] = useState(0)
  /** Per-fieldName warnings for failed local-photo resolutions (never persisted) */
  const [previewWarnings, setPreviewWarnings] = useState<Record<string, { status: string; reason: string }>>({})
  /** Ref to the session pending disposal — deferred until React commits the replacement render */
  const pendingDisposeRef = useRef<ReturnType<typeof createResolutionSession> | null>(null)

  // ── Canvas navigation — spacebar pan + wheel zoom (never persisted) ──
  const canvasWorkspaceRef = useRef<HTMLDivElement>(null)
  const canvasContentRef = useRef<HTMLDivElement>(null)
  const spaceHeldRef = useRef(false)
  const panStartRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null)
  const panOffsetRef = useRef({ x: 0, y: 0 })
  const [cursorMode, setCursorMode] = useState<'default' | 'grab' | 'grabbing'>('default')
  const zoomRef = useRef(zoom)
  useEffect(() => { zoomRef.current = zoom }, [zoom])

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

  // ── Member Photo Preview — sorted members and navigation ──────────────
  const sortedMembers = useMemo(() => {
    if (!members.length) return []
    return [...members].sort((a, b) => {
      const oa = a.displayOrder ?? Infinity
      const ob = b.displayOrder ?? Infinity
      if (oa !== ob) return oa - ob
      return (a.createdAt ?? '').localeCompare(b.createdAt ?? '')
    })
  }, [members])

  const tableNameCol = useMemo(
    () => getTableNameColumn(linkedFolder?.tableColumnRoles),
    [linkedFolder?.tableColumnRoles],
  )

  // Auto-select first member when list loads; reset if current member disappears
  useEffect(() => {
    if (sortedMembers.length === 0) {
      setPreviewMemberId(null)
      return
    }
    if (previewMemberId && sortedMembers.some((m) => m.id === previewMemberId)) return
    setPreviewMemberId(sortedMembers[0].id)
  }, [sortedMembers])

  const previewMemberIdx = sortedMembers.findIndex((m) => m.id === previewMemberId)
  const previewMember = previewMemberIdx >= 0 ? sortedMembers[previewMemberIdx] : null
  const memberDisplayName = previewMember
    ? getMemberDisplayName(previewMember, tableNameCol)
    : ''

  // Collect unique dynamic image field names from both documents
  const dynamicImageFieldsKey = useMemo(() => {
    const fields = new Set<string>()
    const allElements = [...frontDoc.elements, ...backDoc.elements]
    for (const el of allElements) {
      if (
        el.type === 'image' &&
        el.props.dynamic &&
        !el.props.qrCode &&
        !el.props.barcode &&
        el.props.fieldName
      ) {
        fields.add(el.props.fieldName as string)
      }
    }
    return [...fields].sort().join(',')
  }, [frontDoc.elements, backDoc.elements])

  // Refs to avoid stale closures in the resolution effect
  const sortedMembersRef = useRef(sortedMembers)
  useEffect(() => { sortedMembersRef.current = sortedMembers }, [sortedMembers])
  const sessionRef = useRef<ReturnType<typeof createResolutionSession> | null>(null)

  // Resolve local + Drive photos for the currently previewed member
  useEffect(() => {
    if (!previewMemberId || !design?.folderId || !dynamicImageFieldsKey) {
      setPreviewImageSources({})
      setPreviewWarnings({})
      return
    }

    const fieldNames = dynamicImageFieldsKey.split(',').filter(Boolean)
    if (fieldNames.length === 0) {
      setPreviewImageSources({})
      setPreviewWarnings({})
      return
    }

    const member = sortedMembersRef.current.find((m) => m.id === previewMemberId)
    if (!member) {
      setPreviewImageSources({})
      setPreviewWarnings({})
      return
    }

    let cancelled = false
    const prevSession = sessionRef.current
    const newSession = createResolutionSession()
    sessionRef.current = newSession

    setPreviewLoading(true)

    ;(async () => {
      const sources: Record<string, string> = {}
      const warnings: Record<string, { status: string; reason: string }> = {}

      for (const fieldName of fieldNames) {
        if (cancelled) break

        let localResult: PhotoResolutionResult | null = null

        // Try local resolution first if member has a subfolder
        if (member.subfolderId) {
          try {
            localResult = await newSession.resolve(
              design.folderId!,
              member.subfolderId,
              fieldName,
              member.id,
            )
          } catch {
            // IndexedDB or other unexpected failure — treat as no local data
          }
        }

        if (cancelled) break

        if (localResult && isResolved(localResult)) {
          // Local photo resolved successfully
          sources[fieldName] = localResult.url
        } else if (!localResult || localResult.status === 'no-assignment') {
          // No local assignment exists — silent Drive fallback
          const driveUrl = resolveMemberImageUrl(member, fieldName)
          if (driveUrl) {
            sources[fieldName] = driveUrl
          }
        } else {
          // A local assignment exists but resolution failed:
          // permission-required | file-missing | read-failed | storage-error
          // Use Drive image as visual fallback but record the warning
          const driveUrl = resolveMemberImageUrl(member, fieldName)
          if (driveUrl) {
            sources[fieldName] = driveUrl
          }
          warnings[fieldName] = {
            status: localResult.status,
            reason: localResult.reason,
          }
        }
      }

      if (!cancelled) {
        setPreviewImageSources(sources)
        setPreviewWarnings(warnings)
        setPreviewLoading(false)
        // Defer disposal of the PREVIOUS session until after React commits
        // the render with the new sources, so blob: URLs from the old session
        // remain valid until the canvas has switched to the new URLs.
        if (prevSession) {
          // Dispose any still-pending previous session first to avoid leaks
          pendingDisposeRef.current?.dispose()
          pendingDisposeRef.current = prevSession
          requestAnimationFrame(() => {
            if (pendingDisposeRef.current === prevSession) {
              prevSession.dispose()
              pendingDisposeRef.current = null
            }
          })
        }
      } else {
        // Effect was cancelled; dispose the new session we just created
        newSession.dispose()
      }
    })()

    return () => {
      cancelled = true
    }
  }, [previewMemberId, refreshCounter, design?.folderId, dynamicImageFieldsKey])

  // Cleanup: dispose active session and any pending disposal on unmount
  useEffect(() => {
    return () => {
      sessionRef.current?.dispose()
      sessionRef.current = null
      pendingDisposeRef.current?.dispose()
      pendingDisposeRef.current = null
    }
  }, [])

  const navigateMember = useCallback(
    (delta: number) => {
      const idx = sortedMembers.findIndex((m) => m.id === previewMemberId)
      const next = idx + delta
      if (next >= 0 && next < sortedMembers.length) {
        setPreviewMemberId(sortedMembers[next].id)
      }
    },
    [sortedMembers, previewMemberId],
  )

  const handleRefreshPhotos = useCallback(() => {
    setRefreshCounter((c) => c + 1)
  }, [])

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

  // ── Mouse-wheel zoom ────────────────────────────────────────────────
  // Dep on `loading` so the effect re-runs once the workspace div is
  // actually mounted (it is conditionally rendered after the design loads).
  useEffect(() => {
    const el = canvasWorkspaceRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY < 0 ? 10 : -10
      setZoom((z) => Math.max(30, Math.min(200, z + delta)))
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [loading])

  // ── Spacebar + drag to pan ──────────────────────────────────────────
  useEffect(() => {
    const isEditableTarget = (t: EventTarget | null): boolean => {
      if (!t || !(t instanceof HTMLElement)) return false
      const tag = t.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || isEditableTarget(e.target)) return
      e.preventDefault()
      spaceHeldRef.current = true
      setCursorMode('grab')
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      spaceHeldRef.current = false
      panStartRef.current = null
      setCursorMode('default')
    }
    const onBlur = () => {
      spaceHeldRef.current = false
      panStartRef.current = null
      setCursorMode('default')
    }
    const onMouseMove = (e: MouseEvent) => {
      const ps = panStartRef.current
      if (!ps) return
      const content = canvasContentRef.current
      if (!content) return
      const newX = ps.offsetX + (e.clientX - ps.x)
      const newY = ps.offsetY + (e.clientY - ps.y)
      panOffsetRef.current = { x: newX, y: newY }
      content.style.transform = `translate(${newX}px, ${newY}px)`
    }
    const onMouseUp = () => {
      if (!panStartRef.current) return
      panStartRef.current = null
      setCursorMode(spaceHeldRef.current ? 'grab' : 'default')
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const handlePanStart = useCallback((e: React.MouseEvent) => {
    if (!spaceHeldRef.current) return
    e.preventDefault()
    panStartRef.current = {
      x: e.clientX, y: e.clientY,
      offsetX: panOffsetRef.current.x, offsetY: panOffsetRef.current.y,
    }
    setCursorMode('grabbing')
  }, [])

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

  // ── Stretch to Fit: auto-resize stretched elements when card dimensions change ──
  const prevCardDimsRef = useRef<{ w: number; h: number } | null>(null)
  useEffect(() => {
    if (!config) return
    const { w: cardW, h: cardH } = visualCardSize(config)
    const prev = prevCardDimsRef.current
    prevCardDimsRef.current = { w: cardW, h: cardH }
    // Skip the initial render (no previous dims to compare)
    if (!prev) return
    // Only act if dimensions actually changed
    if (prev.w === cardW && prev.h === cardH) return

    const updateStretchedElements = (doc: CardDocument): CardDocument => {
      let changed = false
      const elements = doc.elements.map((el) => {
        if (
          el.type === 'image' &&
          !el.props.dynamic &&
          !el.props.qrCode &&
          !el.props.barcode &&
          el.props.stretchToFit
        ) {
          changed = true
          return { ...el, x: 0, y: 0, width: cardW, height: cardH }
        }
        return el
      })
      return changed ? { ...doc, elements } : doc
    }
    setFrontDoc((prev) => updateStretchedElements(prev))
    setBackDoc((prev) => updateStretchedElements(prev))
  }, [config?.cardWidthMm, config?.cardHeightMm, config?.orientation])

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

      // ── Stretch to Fit auto-disable: if the user manually changes
      // x/y/width/height on an element that has stretchToFit, disable it
      // to avoid confusing snapping loops. We skip this check when the
      // update itself contains stretchToFit (i.e. it's the toggle handler).
      const hasPositionChange = 'x' in updates || 'y' in updates || 'width' in updates || 'height' in updates
      const isStretchToggle = updates.props && 'stretchToFit' in (updates.props as Record<string, unknown>)
      if (hasPositionChange && !isStretchToggle) {
        const currentDoc = activeSide === 'front' ? frontDocRef.current : backDocRef.current
        const el = currentDoc.elements.find((e) => e.id === id)
        if (el && el.props.stretchToFit) {
          // Merge stretchToFit:false into the update
          updates = {
            ...updates,
            props: { ...(el.props), ...(updates.props || {}), stretchToFit: false },
          }
        }
      }

      handleUpdateElement(id, updates)
    },
    [handleUpdateElement, pushUndo, activeSide],
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

        {/* ── Member photo preview navigation ── */}
        {sortedMembers.length > 0 && (
          <div className="flex items-center gap-1 rounded-lg border px-1.5 py-0.5">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => navigateMember(-1)}
              disabled={previewMemberIdx <= 0}
              title="Previous member"
            >
              <ChevronLeftIcon />
            </Button>
            <span className="text-xs tabular-nums text-muted-foreground min-w-[4ch] text-center">
              {previewMemberIdx >= 0 ? previewMemberIdx + 1 : '–'}/{sortedMembers.length}
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => navigateMember(1)}
              disabled={previewMemberIdx >= sortedMembers.length - 1}
              title="Next member"
            >
              <ChevronRightIcon />
            </Button>
            <span className="text-xs text-muted-foreground truncate max-w-[140px]" title={memberDisplayName}>
              {previewLoading ? '…' : memberDisplayName || '—'}
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleRefreshPhotos}
              disabled={previewLoading}
              title="Refresh photos from disk"
            >
              <RefreshCwIcon className={previewLoading ? 'animate-spin' : ''} />
            </Button>
            {/* Local photo resolution warnings */}
            {Object.keys(previewWarnings).length > 0 && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      className="flex items-center gap-0.5 text-amber-500 hover:text-amber-600 px-0.5"
                      onClick={() => {
                        const entries = Object.entries(previewWarnings)
                        const lines = entries.map(([col, w]) => {
                          const action = w.status === 'permission-required'
                            ? 'Reconnect the folder in Data Upload → Local Photos.'
                            : w.status === 'mapping-unavailable'
                            ? 'The mapped folder is no longer accessible. Remap in Data Upload → Local Photos.'
                            : w.status === 'file-missing'
                            ? 'The assigned file may have been renamed or deleted.'
                            : w.status === 'read-failed'
                            ? 'Try refreshing or reconnecting the local folder.'
                            : 'Check local photo settings in Data Upload → Local Photos.'
                          return `• ${col}: ${w.reason}\n  ${action}`
                        })
                        toast.warning(
                          `Local photo issue${entries.length > 1 ? 's' : ''} for ${memberDisplayName || 'this member'}`,
                          {
                            description: lines.join('\n\n'),
                            duration: 10000,
                          },
                        )
                      }}
                    />
                  }
                >
                  <AlertTriangleIcon className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {Object.entries(previewWarnings).map(([col, w]) => (
                    <div key={col} className="text-xs">
                      <span className="font-medium">{col}</span>:{' '}
                      {w.status === 'permission-required' ? 'Permission expired'
                        : w.status === 'mapping-unavailable' ? 'Folder inaccessible'
                        : w.status === 'file-missing' ? 'File missing'
                        : w.status === 'read-failed' ? 'Read failed'
                        : w.status === 'storage-error' ? 'Storage error'
                        : 'Unavailable'}
                    </div>
                  ))}
                  <div className="text-xs text-muted mt-0.5">Click for details</div>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}

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

        <div
          ref={canvasWorkspaceRef}
          className="flex flex-1 items-center justify-center bg-muted/30 overflow-hidden p-6"
          style={cursorMode !== 'default' ? { cursor: cursorMode === 'grabbing' ? 'grabbing' : 'grab' } : undefined}
          onMouseDown={handlePanStart}
        >
          <div ref={canvasContentRef} style={{ transform: `translate(${panOffsetRef.current.x}px, ${panOffsetRef.current.y}px)` }}>
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
              sizeLocked={sizeLocked}
              isPanning={cursorMode !== 'default'}
              previewImageSources={previewImageSources}
            />
          </div>
        </div>

        <RightPanel
          activeDoc={activeDoc}
          selectedElementId={selectedElementId}
          onSelectElement={setSelectedElementId}
          onUpdateElement={handleUpdateElementWithUndo}
          onDeleteElement={handleDeleteElement}
          onDuplicateElement={handleDuplicateElement}
          onReorderElement={handleReorderElement}
          cardConfig={config}
          tableColumns={linkedFolder?.tableColumns}
          tableColumnRoles={linkedFolder?.tableColumnRoles}
          maxLengthPreviewIds={maxLengthPreviewIds}
          onToggleMaxLengthPreview={(id) => {
            const wasEnabled = maxLengthPreviewIds.has(id)
            setMaxLengthPreviewIds((prev) => {
              const next = new Set(prev)
              if (next.has(id)) next.delete(id)
              else next.add(id)
              return next
            })
            // Toggle ON: compute initial dimensions from longest member value
            // and apply to the ACTUAL element through the normal update path.
            // Toggle OFF: keep current dimensions as-is (no revert).
            if (!wasEnabled && config && members.length) {
              const { w: cardW } = visualCardSize(config)
              const aDoc = activeSide === 'front' ? frontDoc : backDoc
              const el = aDoc.elements.find((e) => e.id === id)
              if (el && el.type === 'field') {
                const fieldName = (el.props.fieldName as string) ?? ''
                let longest = ''
                for (const m of members) {
                  const val = resolveDynamicText(m, fieldName)
                  if (val && !val.startsWith('{') && val.length > longest.length) longest = val
                }
                if (longest) {
                  const c = document.createElement('canvas')
                  const cx = c.getContext('2d')
                  if (cx) {
                    const label = (el.props.label as string) ?? ''
                    const fullText = label + longest
                    const fs = (el.props.fontSize as number) ?? 14
                    const fw = (el.props.fontWeight as string) ?? 'normal'
                    const fi = (el.props.fontStyle as string) ?? 'normal'
                    const ff = (el.props.fontFamily as string) ?? 'Inter, sans-serif'
                    const lh = fs * 1.3
                    cx.font = `${fi} ${fw} ${fs}px ${ff}`
                    const tw = cx.measureText(fullText).width + 8
                    const newW = Math.max(el.width, Math.min(Math.ceil(tw), cardW))
                    // Word-wrap height at the computed width
                    const spW = cx.measureText(' ').width
                    const words = fullText.split(/\s+/)
                    let lnW = 0, lnC = 1
                    for (let wi = 0; wi < words.length; wi++) {
                      const word = words[wi]
                      const wW = cx.measureText(word).width
                      const gap = lnW > 0 ? spW : 0
                      if (lnW > 0 && lnW + gap + wW > newW) { lnC++; lnW = 0 }
                      if (lnW > 0) lnW += gap
                      if (wW <= newW) { lnW += wW } else {
                        for (const ch of word) {
                          const cW = cx.measureText(ch).width
                          if (lnW + cW > newW && lnW > 0) { lnC++; lnW = cW } else { lnW += cW }
                        }
                      }
                    }
                    const newH = Math.max(el.height, Math.ceil(lnC * lh))
                    pushUndo()
                    handleUpdateElement(id, { width: newW, height: newH })
                  }
                }
              }
            }
          }}
          sizeLocked={sizeLocked}
          onSizeLockChange={setSizeLocked}
        />
      </div>
    </div>
  )
}


// ---------------------------------------------------------------------------
// Helper: resolve a member's image URL from Firestore-backed fields
// (mirrors the private resolveDynamicImageSrc in card-renderer.ts)
// ---------------------------------------------------------------------------

function resolveMemberImageUrl(
  member: Pick<Member, 'profileImage' | 'signature' | 'divisionLogo' | 'fingerprint' | 'customFields'>,
  fieldName: string,
): string {
  switch (fieldName) {
    case 'profileImage': return member.profileImage ?? ''
    case 'signature': return member.signature ?? ''
    case 'divisionLogo': return member.divisionLogo ?? ''
    case 'fingerprint': return member.fingerprint ?? ''
    default: return member.customFields?.[fieldName] ?? ''
  }
}
