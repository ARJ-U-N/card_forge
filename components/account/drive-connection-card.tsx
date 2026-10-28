'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  CheckCircle2Icon,
  CloudOffIcon,
  HardDriveIcon,
  Loader2Icon,
  RefreshCwIcon,
  AlertTriangleIcon,
  UnplugIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { Spinner } from '@/components/ui/spinner'
import { useAuth } from '@/components/providers/auth-provider'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ConnectionStatus =
  | 'loading'
  | 'connected'
  | 'disconnected'
  | 'error'

interface StatusResponse {
  connected: boolean
  email?: string
  reason?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DriveConnectionCard() {
  const { user, firebaseUser } = useAuth()
  const isOwner = user?.role === 'owner'

  const searchParams = useSearchParams()
  const router = useRouter()

  const [status, setStatus] = useState<ConnectionStatus>('loading')
  const [email, setEmail] = useState<string | undefined>()
  const [disconnectReason, setDisconnectReason] = useState<string | undefined>()
  const [connecting, setConnecting] = useState(false)

  // Disconnect state
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  // -----------------------------------------------------------------------
  // Check connection status
  // -----------------------------------------------------------------------

  const checkStatus = useCallback(async () => {
    setStatus('loading')
    try {
      const res = await fetch('/api/drive/auth/status')
      if (!res.ok) {
        setStatus('error')
        return
      }
      const data: StatusResponse = await res.json()

      if (data.connected) {
        setStatus('connected')
        setEmail(data.email)
        setDisconnectReason(undefined)
      } else {
        setStatus('disconnected')
        setEmail(undefined)
        setDisconnectReason(data.reason)
      }
    } catch {
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    checkStatus()
  }, [checkStatus])

  // -----------------------------------------------------------------------
  // Handle OAuth redirect params (?drive_connected=true or ?drive_error=...)
  // -----------------------------------------------------------------------

  useEffect(() => {
    const driveConnected = searchParams.get('drive_connected')
    const driveError = searchParams.get('drive_error')

    if (driveConnected === 'true') {
      toast.success('Google Drive connected successfully.')
      // Refresh the status to show the new connection
      checkStatus()
      // Clean up the URL params
      const url = new URL(window.location.href)
      url.searchParams.delete('drive_connected')
      router.replace(url.pathname + url.search, { scroll: false })
    } else if (driveError) {
      const message = driveError === 'access_denied'
        ? 'Google Drive authorization was cancelled.'
        : driveError === 'no_refresh_token'
        ? 'Authorization succeeded but Google did not provide a refresh token. Please try again.'
        : driveError === 'state_expired'
        ? 'Authorization timed out. Please try again.'
        : driveError === 'invalid_state' || driveError === 'missing_state'
        ? 'Authorization request was invalid. Please try again.'
        : `Google Drive authorization failed: ${driveError}`
      toast.error(message)
      // Clean up the URL params
      const url = new URL(window.location.href)
      url.searchParams.delete('drive_error')
      router.replace(url.pathname + url.search, { scroll: false })
    }
  }, [searchParams, checkStatus, router])

  // -----------------------------------------------------------------------
  // Initiate connect / reconnect
  // -----------------------------------------------------------------------

  const handleConnect = () => {
    setConnecting(true)
    // Navigate to the connect endpoint which redirects to Google
    window.location.href = '/api/drive/auth/connect'
  }

  // -----------------------------------------------------------------------
  // Disconnect Google Drive
  // -----------------------------------------------------------------------

  const handleDisconnect = async () => {
    if (!firebaseUser) return

    setDisconnecting(true)
    try {
      const idToken = await firebaseUser.getIdToken()

      const res = await fetch('/api/drive/auth/disconnect', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Failed to disconnect Google Drive.')
        return
      }

      // Report result
      if (data.tokenRevoked) {
        toast.success('Google Drive disconnected and authorization revoked.')
      } else if (data.revocationError) {
        toast.success('Google Drive disconnected.', {
          description: `Note: Token revocation failed (${data.revocationError}). You can revoke access manually at myaccount.google.com/permissions.`,
          duration: 8000,
        })
      } else {
        toast.success('Google Drive disconnected.')
      }

      // Refresh the status display
      await checkStatus()
    } catch {
      toast.error('Failed to disconnect Google Drive. Please try again.')
    } finally {
      setDisconnecting(false)
      setShowDisconnectDialog(false)
    }
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const statusLabel = status === 'loading'
    ? 'Checking…'
    : status === 'connected'
    ? 'Connected'
    : status === 'disconnected'
    ? disconnectReason === 'token-expired'
      ? 'Reconnection Required'
      : 'Not Connected'
    : 'Status Unavailable'

  const statusBadgeVariant = status === 'connected'
    ? 'default' as const
    : 'secondary' as const

  return (
    <>
      <Card className="max-w-2xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <HardDriveIcon className="size-4" />
              Google Drive
            </CardTitle>
            {status !== 'loading' && (
              <Badge
                variant={statusBadgeVariant}
                className={
                  status === 'connected'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    : status === 'disconnected'
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                    : ''
                }
              >
                {statusLabel}
              </Badge>
            )}
          </div>
          <CardDescription>
            Parent-submitted photos are stored in Google Drive. Connect your Google account to enable photo uploads.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === 'loading' ? (
            <div className="flex items-center gap-2 py-4">
              <Spinner className="size-4" />
              <span className="text-sm text-muted-foreground">Checking Google Drive connection…</span>
            </div>
          ) : status === 'connected' ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2Icon className="size-4 text-green-600 dark:text-green-400" />
                  <div>
                    <p className="text-sm font-medium">Google Drive is connected</p>
                    {email && (
                      <p className="text-xs text-muted-foreground">{email}</p>
                    )}
                  </div>
                </div>
                {isOwner && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleConnect}
                      disabled={connecting || disconnecting}
                    >
                      {connecting ? (
                        <Loader2Icon className="size-3.5 animate-spin mr-1.5" />
                      ) : (
                        <RefreshCwIcon className="size-3.5 mr-1.5" />
                      )}
                      {connecting ? 'Redirecting…' : 'Switch Account'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowDisconnectDialog(true)}
                      disabled={connecting || disconnecting}
                      className="text-destructive hover:text-destructive"
                    >
                      <UnplugIcon className="size-3.5 mr-1.5" />
                      Disconnect
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ) : status === 'disconnected' ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20 p-3">
                <CloudOffIcon className="size-4 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                    {disconnectReason === 'token-expired'
                      ? 'Google Drive authorization has expired'
                      : 'Google Drive is not connected'}
                  </p>
                  <p className="text-xs text-amber-700/80 dark:text-amber-400/70 mt-0.5">
                    {disconnectReason === 'token-expired'
                      ? 'The stored authorization was revoked or has expired. Reconnect to restore photo uploads.'
                      : 'Connect your Google account to enable parent photo uploads to Google Drive.'}
                  </p>
                </div>
              </div>
              {isOwner ? (
                <Button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="self-start"
                >
                  {connecting ? (
                    <Loader2Icon className="size-4 animate-spin mr-1.5" />
                  ) : (
                    <HardDriveIcon className="size-4 mr-1.5" />
                  )}
                  {connecting
                    ? 'Redirecting to Google…'
                    : disconnectReason === 'token-expired'
                    ? 'Reconnect Google Drive'
                    : 'Connect Google Drive'}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Only the workspace owner can connect Google Drive.
                </p>
              )}
            </div>
          ) : (
            /* status === 'error' */
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-2 rounded-lg border p-3">
                <AlertTriangleIcon className="size-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-medium">Could not check connection status</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    A network error occurred while checking Google Drive. This does not mean
                    Drive is disconnected.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={checkStatus}
                className="self-start"
              >
                <RefreshCwIcon className="size-3.5 mr-1.5" />
                Retry
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disconnect confirmation dialog */}
      <AlertDialog
        open={showDisconnectDialog}
        onOpenChange={(open) => {
          if (!open && !disconnecting) setShowDisconnectDialog(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive">
              <UnplugIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>Disconnect Google Drive?</AlertDialogTitle>
            <AlertDialogDescription>
              CardForge will remove its stored connection to Google Drive.
              Parent photo uploads will stop working until a new account is connected.
              <br /><br />
              Files already stored in Google Drive will <strong>not</strong> be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnecting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {disconnecting ? (
                <>
                  <Loader2Icon className="size-3.5 animate-spin mr-1.5" />
                  Disconnecting…
                </>
              ) : (
                'Disconnect Google Drive'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
