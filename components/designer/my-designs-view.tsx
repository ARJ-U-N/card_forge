'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  MoreHorizontalIcon,
  PaletteIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/app/page-header'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useAuth } from '@/components/providers/auth-provider'
import { usePortal } from '@/components/providers/portal-provider'
import { subscribeDesigns, deleteDesign } from '@/lib/firebase/design-repository'
import type { Design } from '@/lib/models/types'

export function MyDesignsView() {
  const { user } = useAuth()
  const { isPortalUser, portalFolderId } = usePortal()
  const router = useRouter()
  const workspaceId = user?.workspaceId ?? ''

  const [designs, setDesigns] = useState<Design[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Design | null>(null)

  useEffect(() => {
    if (!workspaceId) return
    setLoading(true)
    const unsub = subscribeDesigns(
      workspaceId,
      (d) => {
        setDesigns(d)
        setLoading(false)
      },
      () => setLoading(false),
    )
    return unsub
  }, [workspaceId])

  const filtered = useMemo(() => {
    // Portal users only see designs linked to their folder
    let list = designs
    if (isPortalUser && portalFolderId) {
      list = list.filter((d) => d.folderId === portalFolderId)
    }
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter((d) => d.name.toLowerCase().includes(q))
  }, [designs, search, isPortalUser, portalFolderId])

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteDesign(workspaceId, deleteTarget.id)
      toast.success('Design deleted')
    } catch {
      toast.error('Failed to delete design')
    } finally {
      setDeleteTarget(null)
    }
  }

  return (
    <>
      <PageHeader
        title="My Designs"
        description="All your saved card designs."
        actions={
          <Button onClick={() => router.push('/designer')}>
            <PlusIcon data-icon="inline-start" />
            New Design
          </Button>
        }
      />

      <div className="relative max-w-xs">
        <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search designs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((design) => (
            <Card
              key={design.id}
              className="group cursor-pointer overflow-hidden transition-shadow hover:ring-2 hover:ring-ring/30"
              onClick={() => router.push(`/designer/${design.id}`)}
            >
              <div
                className="relative h-28 flex items-center justify-center"
                style={{
                  background:
                    design.frontDocument.background ||
                    design.cardConfiguration.frontBackground,
                }}
              >
                <div className="flex h-[55px] w-[88px] items-center justify-center rounded bg-white/10 backdrop-blur-sm border border-white/20">
                  <PaletteIcon className="size-4 text-white/60" />
                </div>
                <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="secondary"
                          size="icon-xs"
                          onClick={(e) => e.stopPropagation()}
                        />
                      }
                    >
                      <MoreHorizontalIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          router.push(`/designer/${design.id}`)
                        }}
                      >
                        <PencilIcon />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteTarget(design)
                        }}
                      >
                        <Trash2Icon />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <CardContent className="p-3">
                <p className="truncate text-sm font-medium">{design.name}</p>
                <p className="text-xs text-muted-foreground">
                  {design.cardConfiguration.orientation === 'horizontal'
                    ? 'Horizontal'
                    : 'Vertical'}{' '}
                  · {new Date(design.updatedAt).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Empty className="flex-1 border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon"><PaletteIcon /></EmptyMedia>
            <EmptyTitle>
              {search.trim() ? `No designs match "${search}"` : 'No designs yet'}
            </EmptyTitle>
            <EmptyDescription>
              {search.trim()
                ? 'Try a different search term.'
                : 'Create your first design from a template or blank canvas.'}
            </EmptyDescription>
          </EmptyHeader>
          {!search.trim() && (
            <EmptyContent>
              <Button onClick={() => router.push('/designer')}>
                <PlusIcon data-icon="inline-start" />
                New Design
              </Button>
            </EmptyContent>
          )}
        </Empty>
      )}

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive">
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>
              Delete &ldquo;{deleteTarget?.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this design. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
