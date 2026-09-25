'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  ImageIcon,
  PenLineIcon,
  SearchIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { PageHeader } from '@/components/app/page-header'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { useAuth } from '@/components/providers/auth-provider'
import {
  subscribeAssets,
  uploadAsset,
  deleteAsset,
} from '@/lib/firebase/asset-repository'
import type { Asset, AssetCategory } from '@/lib/models/types'
import { cn } from '@/lib/utils'

const CATEGORIES: { value: AssetCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All Assets' },
  { value: 'image', label: 'Images' },
  { value: 'logo', label: 'Logos' },
  { value: 'signature', label: 'Signatures' },
  { value: 'other', label: 'Other' },
]

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AssetLibraryView() {
  const { user } = useAuth()
  const workspaceId = user?.workspaceId ?? ''
  const fileRef = useRef<HTMLInputElement>(null)

  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<AssetCategory | 'all'>('all')
  const [uploadCategory, setUploadCategory] = useState<AssetCategory>('image')
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null)

  useEffect(() => {
    if (!workspaceId) return
    setLoading(true)
    const unsub = subscribeAssets(workspaceId, (a) => {
      setAssets(a)
      setLoading(false)
    })
    return unsub
  }, [workspaceId])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    setUploading(true)
    let count = 0
    try {
      for (const file of Array.from(files)) {
        await uploadAsset(workspaceId, file, uploadCategory)
        count++
      }
      toast.success(`Uploaded ${count} asset${count > 1 ? 's' : ''}`)
    } catch {
      toast.error('Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteAsset(workspaceId, deleteTarget.id, deleteTarget.driveFileId)
      toast.success('Asset deleted')
    } catch {
      toast.error('Failed to delete asset')
    }
    setDeleteTarget(null)
  }

  const filtered = assets.filter((a) => {
    const matchCat = category === 'all' || a.category === category
    const matchSearch = !search.trim() || a.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  return (
    <>
      <PageHeader
        title="Asset Library"
        description="Manage reusable images, logos, and signatures for your designs."
      />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={category} onValueChange={(v) => setCategory(v as AssetCategory | 'all')}>
          <SelectTrigger className="h-9 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <SearchIcon className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search assets…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 pl-8 text-xs" />
        </div>

        <div className="flex-1" />

        <Select value={uploadCategory} onValueChange={(v) => setUploadCategory(v as AssetCategory)}>
          <SelectTrigger className="h-9 w-32 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="image">Image</SelectItem>
            <SelectItem value="logo">Logo</SelectItem>
            <SelectItem value="signature">Signature</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>

        <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Spinner data-icon="inline-start" /> : <UploadIcon data-icon="inline-start" />}
          {uploading ? 'Uploading…' : 'Upload'}
        </Button>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Spinner className="size-6" /></div>
      ) : filtered.length === 0 ? (
        <Empty className="flex-1 border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon"><ImageIcon /></EmptyMedia>
            <EmptyTitle>{search.trim() ? 'No matching assets' : 'No assets yet'}</EmptyTitle>
            <EmptyDescription>
              {search.trim() ? 'Try a different search term.' : 'Upload images, logos, or signatures to use in your designs.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filtered.map((asset) => (
            <div key={asset.id} className="group relative rounded-lg border bg-card overflow-hidden transition-shadow hover:ring-2 hover:ring-ring/30">
              <div className="relative aspect-square bg-muted/30 flex items-center justify-center">
                <img src={asset.url} alt={asset.name} className="size-full object-contain p-2" draggable={false} />
                <Badge variant="secondary" className="absolute top-1.5 right-1.5 text-[9px] capitalize">
                  {asset.category}
                </Badge>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(asset)}
                  className="absolute bottom-1.5 right-1.5 rounded-md bg-destructive/90 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2Icon className="size-3" />
                </button>
              </div>
              <div className="px-2 py-1.5 border-t">
                <p className="truncate text-xs font-medium">{asset.name}</p>
                <p className="text-[10px] text-muted-foreground">{formatBytes(asset.sizeBytes)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Asset"
        description={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </>
  )
}
