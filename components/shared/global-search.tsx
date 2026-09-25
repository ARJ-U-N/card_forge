'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  FolderIcon,
  PaletteIcon,
  SearchIcon,
  UserIcon,
  XIcon,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/components/providers/auth-provider'
import { subscribeFolders } from '@/lib/firebase/folder-repository'
import { subscribeAllMembers } from '@/lib/firebase/member-repository'
import { subscribeDesigns } from '@/lib/firebase/design-repository'
import type { Design, Folder, Member } from '@/lib/models/types'
import { cn } from '@/lib/utils'

interface SearchResult {
  id: string
  type: 'folder' | 'member' | 'design'
  title: string
  subtitle: string
  href: string
}

export function GlobalSearch({ trigger }: { trigger: React.ReactElement }) {
  const { user } = useAuth()
  const router = useRouter()
  const workspaceId = user?.workspaceId ?? ''

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [folders, setFolders] = useState<Folder[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [designs, setDesigns] = useState<Design[]>([])

  useEffect(() => {
    if (!workspaceId || !open) return
    const unsubs = [
      subscribeFolders(workspaceId, setFolders),
      subscribeAllMembers(workspaceId, setMembers),
      subscribeDesigns(workspaceId, setDesigns),
    ]
    return () => unsubs.forEach((u) => u())
  }, [workspaceId, open])

  const results = useMemo<SearchResult[]>(() => {
    const q = query.toLowerCase().trim()
    if (!q) return []
    const out: SearchResult[] = []

    // Folders
    folders.filter((f) => f.name.toLowerCase().includes(q)).forEach((f) => {
      out.push({
        id: f.id,
        type: 'folder',
        title: f.name,
        subtitle: f.parentFolderId ? 'Subfolder' : 'Folder',
        href: `/data-upload/${f.id}`,
      })
    })

    // Members
    members
      .filter((m) =>
        `${m.firstName} ${m.lastName}`.toLowerCase().includes(q) ||
        m.employeeId.toLowerCase().includes(q) ||
        m.department.toLowerCase().includes(q),
      )
      .slice(0, 15)
      .forEach((m) => {
        out.push({
          id: m.id,
          type: 'member',
          title: `${m.firstName} ${m.lastName}`,
          subtitle: [m.department, m.employeeId].filter(Boolean).join(' · ') || 'Member',
          href: `/data-upload/${m.folderId}`,
        })
      })

    // Designs
    designs.filter((d) => d.name.toLowerCase().includes(q)).forEach((d) => {
      out.push({
        id: d.id,
        type: 'design',
        title: d.name,
        subtitle: `${d.cardConfiguration.orientation} · ${d.cardConfiguration.material === '30mil-pvc' ? '30 Mil PVC' : 'Adhesive PVC'}`,
        href: `/designer/${d.id}`,
      })
    })

    return out.slice(0, 30)
  }, [query, folders, members, designs])

  const handleSelect = (result: SearchResult) => {
    router.push(result.href)
    setOpen(false)
    setQuery('')
  }

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const icons = {
    folder: FolderIcon,
    member: UserIcon,
    design: PaletteIcon,
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQuery('') }}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <div className="flex items-center border-b px-3">
          <SearchIcon className="size-4 text-muted-foreground shrink-0" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search folders, members, designs…"
            className="border-0 shadow-none focus-visible:ring-0 h-11 text-sm"
            autoFocus
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground">
              <XIcon className="size-4" />
            </button>
          )}
        </div>

        <div className="max-h-72 overflow-y-auto">
          {query.trim() && results.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No results for &ldquo;{query}&rdquo;
            </div>
          ) : (
            results.map((r) => {
              const Icon = icons[r.type]
              return (
                <button
                  key={`${r.type}-${r.id}`}
                  type="button"
                  onClick={() => handleSelect(r)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted transition-colors"
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">{r.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.subtitle}</p>
                  </div>
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] uppercase text-muted-foreground">
                    {r.type}
                  </span>
                </button>
              )
            })
          )}

          {!query.trim() && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Start typing to search across folders, members, and designs
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t px-3 py-2 text-[10px] text-muted-foreground">
          <span>↑↓ Navigate · ↵ Select · Esc Close</span>
          <span className="rounded border px-1 py-0.5 font-mono">⌘K</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
