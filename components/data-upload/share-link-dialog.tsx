'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertCircleIcon,
  CheckIcon,
  CopyIcon,
  LinkIcon,
  Loader2Icon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Folder } from '@/lib/models/types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  /** Main College folder */
  folder: Folder
  /** The subfolder being shared */
  subfolder: Folder
}

export function ShareLinkDialog({
  open,
  onOpenChange,
  workspaceId,
  folder,
  subfolder,
}: Props) {
  const [share, setShare] = useState<{ shareToken: string; enabled: boolean; hasDesign?: boolean; hasTable?: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setCopied(false)
    fetch('/api/parent-form/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId,
        folderId: folder.id,
        subfolderId: subfolder.id,
        folderName: folder.name,
        subfolderName: subfolder.name,
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('API error')
        return res.json()
      })
      .then(setShare)
      .catch(() => toast.error('Failed to load share link'))
      .finally(() => setLoading(false))
  }, [open, workspaceId, folder, subfolder])

  const shareUrl = share
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/parent-form/${share.shareToken}`
    : ''

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      toast.success('Link copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }

  const handleToggle = async (enabled: boolean) => {
    if (!share) return
    setToggling(true)
    try {
      const res = await fetch('/api/parent-form/share', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subfolderId: subfolder.id, enabled }),
      })
      if (!res.ok) throw new Error('API error')
      setShare((prev) => (prev ? { ...prev, enabled } : prev))
      toast.success(enabled ? 'Share link enabled' : 'Share link disabled')
    } catch {
      toast.error('Failed to update')
    } finally {
      setToggling(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="size-4" />
            Share Link — {subfolder.name}
          </DialogTitle>
          <DialogDescription>
            Share this link with parents. They can fill in their details
            without needing a CardForge account.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner className="size-6" />
          </div>
        ) : share ? (
          <div className="flex flex-col gap-4">
            {/* Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Link Status</span>
                <Badge
                  variant={share.enabled ? 'default' : 'secondary'}
                  className={
                    share.enabled
                      ? 'bg-green-500/10 text-green-700'
                      : ''
                  }
                >
                  {share.enabled ? 'Active' : 'Disabled'}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                {toggling && <Loader2Icon className="size-3.5 animate-spin" />}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleToggle(!share.enabled)}
                  disabled={toggling}
                >
                  {share.enabled ? 'Disable' : 'Enable'}
                </Button>
              </div>
            </div>

            {/* Link */}
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={shareUrl}
                className="text-xs font-mono"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopy}
                disabled={!share.enabled}
              >
                {copied ? (
                  <CheckIcon className="size-4 text-green-600" />
                ) : (
                  <CopyIcon className="size-4" />
                )}
              </Button>
            </div>

            {/* Info */}
            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground flex flex-col gap-1">
              <p>
                <strong>College:</strong> {folder.name}
              </p>
              <p>
                <strong>Subfolder:</strong> {subfolder.name}
              </p>
              <p>
                Parents who open this link will see only the table
                headings for <strong>{folder.name}</strong> and their
                submission will go into <strong>{subfolder.name}</strong>.
              </p>
            </div>

            {/* Readiness warnings */}
            {(!share.hasTable || !share.hasDesign) && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <AlertCircleIcon className="size-4 mt-0.5 shrink-0" />
                <div className="flex flex-col gap-1">
                  {!share.hasTable && (
                    <p>No table has been created for this College yet.</p>
                  )}
                  {!share.hasDesign && (
                    <p>Create and save an ID-card design before sharing with parents.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Failed to generate share link.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
