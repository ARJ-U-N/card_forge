'use client'

import { useCallback, useEffect, useState } from 'react'
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
  Design,
  Folder,
} from '@/lib/models/types'
import { LeftPanel } from './panels/left-panel'
import { RightPanel } from './panels/right-panel'
import { CardCanvas } from './canvas/card-canvas'

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

  // Linked folder (for table-based dynamic fields)
  const [linkedFolder, setLinkedFolder] = useState<Folder | null>(null)

  // Editor state
  const [activeSide, setActiveSide] = useState<'front' | 'back'>('front')
  const [zoom, setZoom] = useState(100)
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [config, setConfig] = useState<CardConfiguration | null>(null)
  const [frontDoc, setFrontDoc] = useState<CardDocument>({ elements: [], background: '#ffffff' })
  const [backDoc, setBackDoc] = useState<CardDocument>({ elements: [], background: '#ffffff' })

  // Load design
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
        // Load the linked folder for table-based dynamic fields
        if (d.folderId) {
          const f = await getFolder(workspaceId, d.folderId)
          setLinkedFolder(f)
        }
      }
      setLoading(false)
    })
  }, [workspaceId, designId])

  const activeDoc = activeSide === 'front' ? frontDoc : backDoc
  const setActiveDoc = activeSide === 'front' ? setFrontDoc : setBackDoc

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

  const handleAddElement = useCallback(
    (element: CanvasElement) => {
      setActiveDoc((prev) => ({
        ...prev,
        elements: [...prev.elements, element],
      }))
      setSelectedElementId(element.id)
    },
    [activeSide],
  )

  const handleDeleteElement = useCallback(
    (id: string) => {
      setActiveDoc((prev) => ({
        ...prev,
        elements: prev.elements.filter((el) => el.id !== id),
      }))
      if (selectedElementId === id) setSelectedElementId(null)
    },
    [activeSide, selectedElementId],
  )

  const handleDuplicateElement = useCallback(
    (id: string) => {
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
    [activeSide],
  )

  const handleReorderElement = useCallback(
    (id: string, direction: 'up' | 'down') => {
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
    [activeSide],
  )

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!selectedElementId) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Don't delete if an input is focused
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
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
  }, [selectedElementId, handleDeleteElement, handleDuplicateElement])

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
        />

        <div className="flex flex-1 items-center justify-center bg-muted/30 overflow-auto p-6">
          <CardCanvas
            config={config}
            document={activeDoc}
            zoom={zoom}
            selectedElementId={selectedElementId}
            onSelectElement={setSelectedElementId}
            onUpdateElement={handleUpdateElement}
          />
        </div>

        <RightPanel
          activeDoc={activeDoc}
          selectedElementId={selectedElementId}
          onSelectElement={setSelectedElementId}
          onUpdateElement={handleUpdateElement}
          onDeleteElement={handleDeleteElement}
          onDuplicateElement={handleDuplicateElement}
          onReorderElement={handleReorderElement}
        />
      </div>
    </div>
  )
}
