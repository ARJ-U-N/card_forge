'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  GlobeIcon,
  PowerIcon,
  SettingsIcon,
  Trash2Icon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import {
  subscribePortalsForWorkspace,
  updatePortalSettings,
  deletePortal,
} from '@/lib/firebase/portal-repository'
import { PortalSettingsDialog } from '@/components/data-upload/portal-settings-dialog'
import type { Portal } from '@/lib/models/types'

export function PortalSettingsCard() {
  const { user } = useAuth()
  const workspaceId = user?.workspaceId ?? ''
  const isOwner = user?.role === 'owner'

  const [portals, setPortals] = useState<Portal[]>([])
  const [loading, setLoading] = useState(true)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Portal | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [managePortal, setManagePortal] = useState<Portal | null>(null)

  useEffect(() => {
    if (!workspaceId) return
    const unsub = subscribePortalsForWorkspace(
      workspaceId,
      (list) => {
        setPortals(list)
        setLoading(false)
      },
      () => setLoading(false),
    )
    return unsub
  }, [workspaceId])

  const activeCount = portals.filter((p) => p.enabled).length
  const totalCount = portals.length

  const handleToggle = async (portal: Portal) => {
    try {
      setTogglingId(portal.id)
      await updatePortalSettings(portal.folderId, {
        enabled: !portal.enabled,
      })
      toast.success(
        portal.enabled
          ? `Portal for "${portal.folderName}" disabled`
          : `Portal for "${portal.folderName}" enabled`,
      )
    } catch {
      toast.error('Failed to update portal')
    } finally {
      setTogglingId(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      setDeleting(true)
      await deletePortal(deleteTarget.folderId)
      toast.success(`Portal for "${deleteTarget.folderName}" deleted`)
    } catch {
      toast.error('Failed to delete portal')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  // Non-owners see simplified card
  if (!isOwner) {
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GlobeIcon className="size-4" />
            Collaborator Portal
          </CardTitle>
          <CardDescription>
            Share a secure, PIN-protected portal link with external collaborators
            to give them read-only access to your workspace member data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PortalSettingsDialog
            trigger={
              <Button variant="outline">
                <GlobeIcon data-icon="inline-start" />
                Manage Portal Settings
              </Button>
            }
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="max-w-2xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <GlobeIcon className="size-4" />
              Collaborator Portal
            </CardTitle>
            {!loading && (
              <Badge variant="secondary" className="text-xs">
                Active Portals: {activeCount} / {totalCount}
              </Badge>
            )}
          </div>
          <CardDescription>
            Manage all College portals from here. Enable, disable, or delete
            portal access for each College.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner className="size-5" />
            </div>
          ) : portals.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-muted-foreground">
                No portals created yet. Open a College folder and configure its
                Portal Settings to create one.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {portals.map((portal) => (
                <div
                  key={portal.id}
                  className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/30"
                >
                  {/* Name + status */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {portal.folderName || portal.folderId}
                      </span>
                      <Badge
                        variant={portal.enabled ? 'default' : 'secondary'}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {portal.enabled ? 'Active' : 'Disabled'}
                      </Badge>
                    </div>
                    {portal.collaboratorEmail && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {portal.collaboratorEmail}
                      </p>
                    )}
                  </div>

                  {/* Enable/Disable toggle */}
                  <Button
                    variant={portal.enabled ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleToggle(portal)}
                    disabled={togglingId === portal.id}
                    className="text-xs min-w-[70px]"
                  >
                    <PowerIcon data-icon="inline-start" />
                    {togglingId === portal.id
                      ? '…'
                      : portal.enabled
                        ? 'Enabled'
                        : 'Disabled'}
                  </Button>

                  {/* Manage button */}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setManagePortal(portal)}
                    aria-label={`Manage ${portal.folderName} settings`}
                  >
                    <SettingsIcon />
                  </Button>

                  {/* Delete button */}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setDeleteTarget(portal)}
                    aria-label={`Delete ${portal.folderName} portal`}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manage Settings Dialog — reuses existing PortalSettingsDialog */}
      {managePortal && (
        <PortalSettingsDialog
          open
          onOpenChange={(open) => {
            if (!open) setManagePortal(null)
          }}
          initialFolderId={managePortal.folderId}
          initialFolderName={managePortal.folderName}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive">
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete this College Portal?</AlertDialogTitle>
            <AlertDialogDescription>
              Only the Portal configuration will be deleted. The College folder,
              table, members, design, and other College data will NOT be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting…' : 'Delete Portal'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
