'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircleIcon,
  FileIcon,
  LayoutTemplateIcon,
  PaletteIcon,
  PlusIcon,
  SchoolIcon,
  SearchIcon,
  SparklesIcon,
  TableIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { PageHeader } from '@/components/app/page-header'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import {
  getOfficialTemplates,
  seedOfficialTemplates,
} from '@/lib/firebase/template-repository'
import { createDesign, subscribeDesigns } from '@/lib/firebase/design-repository'
import { subscribeFolders } from '@/lib/firebase/folder-repository'
import { DEFAULT_CARD_CONFIG, type Design, type Folder, type Template } from '@/lib/models/types'

const GRADIENT_PREVIEWS: Record<string, string> = {
  'Green Gradient': 'linear-gradient(135deg, #059669, #047857)',
  'Violet Blossom': 'linear-gradient(135deg, #7c3aed, #6d28d9)',
  'Ocean Blue': 'linear-gradient(135deg, #2563eb, #1d4ed8)',
  'Sunset Corporate': 'linear-gradient(135deg, #ea580c, #dc2626)',
}

export function DesignerGetStarted() {
  const { user } = useAuth()
  const { isPortalUser, portalFolderId } = usePortal()
  const router = useRouter()
  const workspaceId = user?.workspaceId ?? ''

  const [templates, setTemplates] = useState<Template[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [designs, setDesigns] = useState<Design[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Folder selection dialog state
  const [selectFolderOpen, setSelectFolderOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<
    | { type: 'blank' }
    | { type: 'template'; template: Template }
    | null
  >(null)

  useEffect(() => {
    if (!workspaceId) return
    async function load() {
      try {
        await seedOfficialTemplates()
        const official = await getOfficialTemplates()
        setTemplates(official)
      } catch (e) {
        console.error('Failed to load templates', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [workspaceId])

  // Subscribe to all folders
  useEffect(() => {
    if (!workspaceId) return
    const unsub = subscribeFolders(workspaceId, setFolders)
    return unsub
  }, [workspaceId])

  // Subscribe to all designs (to enforce one-design-per-folder)
  useEffect(() => {
    if (!workspaceId) return
    const unsub = subscribeDesigns(workspaceId, setDesigns)
    return unsub
  }, [workspaceId])

  const isOwner = user?.role === 'owner'

  // Main/root folders that have a table defined
  // Portal users see only their linked folder
  // Non-owners cannot design for locked (submitted) folders
  const eligibleFolders = useMemo(
    () =>
      folders.filter(
        (f) =>
          f.parentFolderId === null &&
          f.tableColumns &&
          f.tableColumns.length > 0 &&
          (!isPortalUser || !portalFolderId || f.id === portalFolderId) &&
          (isOwner || !f.submittedAt),
      ),
    [folders, isPortalUser, portalFolderId, isOwner],
  )

  const filtered = useMemo(() => {
    if (!search.trim()) return templates
    const q = search.toLowerCase()
    return templates.filter((t) => t.name.toLowerCase().includes(q))
  }, [templates, search])

  // ── Start design creation flow ──
  const initiateCreate = (action: NonNullable<typeof pendingAction>) => {
    if (eligibleFolders.length === 0) {
      toast.error('No school folders with tables', {
        description: 'Create a table in a school folder first before designing a card.',
      })
      return
    }
    setPendingAction(action)
    setSelectFolderOpen(true)
  }

  const handleSelectFolder = async (folder: Folder) => {
    if (!pendingAction) return
    setSelectFolderOpen(false)

    // ── One College = one design. If a design already exists, open it. ──
    const existingDesign = designs.find((d) => d.folderId === folder.id)
    if (existingDesign) {
      toast.info(`A design already exists for "${folder.name}". Opening it for editing.`)
      router.push(`/designer/${existingDesign.id}`)
      setPendingAction(null)
      return
    }

    if (pendingAction.type === 'blank') {
      setCreating('blank')
      try {
        const id = await createDesign(
          workspaceId,
          `${folder.name} Design`,
          null,
          DEFAULT_CARD_CONFIG,
          undefined,
          undefined,
          folder.id,
        )
        router.push(`/designer/${id}`)
      } catch {
        toast.error('Failed to create design')
        setCreating(null)
      }
    } else {
      const { template } = pendingAction
      setCreating(template.id)
      try {
        const id = await createDesign(
          workspaceId,
          `${folder.name} — ${template.name}`,
          template.id,
          template.cardConfiguration,
          template.frontDocument,
          template.backDocument,
          folder.id,
        )
        router.push(`/designer/${id}`)
      } catch {
        toast.error('Failed to create design')
        setCreating(null)
      }
    }

    setPendingAction(null)
  }

  return (
    <>
      <PageHeader
        title="Designer"
        description="Create professional ID cards from templates or start with a blank canvas."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.push('/designer/my-designs')}>
              <PaletteIcon data-icon="inline-start" />
              My Designs
            </Button>
          </div>
        }
      />

      {/* Blank canvas card */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Start Fresh
        </h2>

        {eligibleFolders.length === 0 && !loading && (
          <Alert>
            <AlertCircleIcon />
            <AlertTitle>No school folders with tables</AlertTitle>
            <AlertDescription>
              Go to <strong>Data Upload</strong>, create a school folder, and define a table before creating a card design.
            </AlertDescription>
          </Alert>
        )}

        <button
          type="button"
          onClick={() => initiateCreate({ type: 'blank' })}
          disabled={creating === 'blank' || eligibleFolders.length === 0}
          className="group flex h-44 w-full max-w-xs items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/25 bg-muted/30 transition-all hover:border-primary/50 hover:bg-primary/5 disabled:opacity-50"
        >
          {creating === 'blank' ? (
            <Spinner className="size-6" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground group-hover:text-primary transition-colors">
              <div className="flex size-12 items-center justify-center rounded-xl border-2 border-dashed">
                <PlusIcon className="size-6" />
              </div>
              <span className="text-sm font-medium">Blank Canvas</span>
              <span className="text-xs">Select a school, then design</span>
            </div>
          )}
        </button>
      </section>

      {/* Official templates */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <SparklesIcon className="size-3.5" />
            Official ID Templates
          </h2>
          {templates.length > 3 && (
            <div className="relative max-w-xs">
              <SearchIcon className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search templates…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
          )}
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-56 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((template) => (
              <Card
                key={template.id}
                className="group cursor-pointer overflow-hidden transition-shadow hover:ring-2 hover:ring-ring/30"
                onClick={() => !creating && initiateCreate({ type: 'template', template })}
              >
                {/* Preview */}
                <div
                  className="relative h-36 flex items-center justify-center"
                  style={{
                    background:
                      GRADIENT_PREVIEWS[template.name] ??
                      template.cardConfiguration.frontBackground,
                  }}
                >
                  {creating === template.id ? (
                    <Spinner className="size-6 text-white" />
                  ) : (
                    <>
                      {/* Mini card preview */}
                      <div className="relative flex h-[70px] w-[110px] items-center justify-center rounded-md bg-white/10 backdrop-blur-sm border border-white/20 shadow-lg">
                        <div className="flex flex-col items-center gap-1 px-2">
                          <div className="h-1.5 w-12 rounded-full bg-white/60" />
                          <div className="flex gap-1.5">
                            <div className="h-6 w-5 rounded bg-white/30" />
                            <div className="flex flex-col gap-0.5">
                              <div className="h-1 w-8 rounded bg-white/50" />
                              <div className="h-1 w-6 rounded bg-white/30" />
                              <div className="h-1 w-10 rounded bg-white/20" />
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                    </>
                  )}
                </div>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{template.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {template.cardConfiguration.orientation === 'horizontal'
                          ? 'Horizontal'
                          : 'Vertical'}{' '}
                        · Official
                      </p>
                    </div>
                    <LayoutTemplateIcon className="size-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : search.trim() ? (
          <Empty className="border border-dashed py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon"><SearchIcon /></EmptyMedia>
              <EmptyTitle>No templates match &ldquo;{search}&rdquo;</EmptyTitle>
              <EmptyDescription>Try a different search term.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" size="sm" onClick={() => setSearch('')}>
                Clear search
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <Empty className="border border-dashed py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon"><FileIcon /></EmptyMedia>
              <EmptyTitle>No templates available</EmptyTitle>
              <EmptyDescription>
                Templates will appear here once they are created.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </section>

      {/* ── Folder Selection Dialog ─────────────────────────────────── */}
      <Dialog open={selectFolderOpen} onOpenChange={(v) => { if (!v) setPendingAction(null); setSelectFolderOpen(v) }}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SchoolIcon className="size-4" />
              Select School / College
            </DialogTitle>
            <DialogDescription>
              Choose the main school folder for this design. The card fields will come from the school&apos;s table.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5 overflow-auto">
            {eligibleFolders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                onClick={() => handleSelectFolder(folder)}
                className="flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted hover:border-primary/50"
              >
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                  <SchoolIcon className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{folder.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <TableIcon className="size-3" />
                    {folder.tableColumns?.length} column{folder.tableColumns && folder.tableColumns.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </button>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setPendingAction(null); setSelectFolderOpen(false) }}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
