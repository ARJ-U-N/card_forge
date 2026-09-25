'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  CheckIcon,
  ClipboardIcon,
  ExternalLinkIcon,
  GlobeIcon,
  KeyIcon,
  ShieldIcon,
  SchoolIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/components/providers/auth-provider'
import {
  getOrCreatePortal,
  subscribePortal,
  updatePortalSettings,
  updatePortalPin,
  regeneratePortalToken,
} from '@/lib/firebase/portal-repository'
import { subscribeFolders } from '@/lib/firebase/folder-repository'
import {
  portalPinSchema,
  portalSettingsSchema,
  type PortalPinValues,
  type PortalSettingsValues,
} from '@/lib/validation/portal'
import type { Folder, Portal } from '@/lib/models/types'

interface Props {
  /** Trigger element for uncontrolled mode (e.g. from account page). */
  trigger?: React.ReactElement
  /** Controlled open state (used from folder card). */
  open?: boolean
  /** Controlled open change handler. */
  onOpenChange?: (open: boolean) => void
  /** Pre-selected folder ID when opened from a folder card. */
  initialFolderId?: string
  /** Pre-selected folder name when opened from a folder card. */
  initialFolderName?: string
}

export function PortalSettingsDialog({
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  initialFolderId,
  initialFolderName,
}: Props) {
  const { user } = useAuth()
  const workspaceId = user?.workspaceId ?? ''

  // College selector state
  const [rootFolders, setRootFolders] = useState<Folder[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string>(initialFolderId ?? '')
  const [selectedFolderName, setSelectedFolderName] = useState<string>(initialFolderName ?? '')

  const [portal, setPortal] = useState<Portal | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [updatingPin, setUpdatingPin] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showPinInput, setShowPinInput] = useState(false)

  // Load root (main) folders for the College dropdown
  useEffect(() => {
    if (!workspaceId) return
    const unsub = subscribeFolders(workspaceId, (folders) => {
      const roots = folders.filter((f) => f.parentFolderId === null)
      setRootFolders(roots)
    })
    return unsub
  }, [workspaceId])

  // Set initial folder when opened with a pre-selected folder
  useEffect(() => {
    if (initialFolderId) {
      setSelectedFolderId(initialFolderId)
      setSelectedFolderName(initialFolderName ?? '')
    }
  }, [initialFolderId, initialFolderName])

  // Load/subscribe portal when a folder is selected
  useEffect(() => {
    if (!workspaceId || !selectedFolderId) {
      setPortal(null)
      setLoading(!selectedFolderId)
      return
    }
    setLoading(true)
    getOrCreatePortal(workspaceId, selectedFolderId, selectedFolderName).then(() =>
      setLoading(false),
    )
    const unsub = subscribePortal(selectedFolderId, (p) => {
      setPortal(p)
      setLoading(false)
    })
    return unsub
  }, [workspaceId, selectedFolderId, selectedFolderName])

  // Settings form
  const settingsForm = useForm<PortalSettingsValues>({
    resolver: zodResolver(portalSettingsSchema),
    defaultValues: { collaboratorEmail: '', notificationEnabled: false },
  })

  // PIN form
  const pinForm = useForm<PortalPinValues>({
    resolver: zodResolver(portalPinSchema),
    defaultValues: { pin: '' },
  })

  // Sync portal data to form
  useEffect(() => {
    if (portal) {
      settingsForm.reset({
        collaboratorEmail: portal.collaboratorEmail,
        notificationEnabled: portal.notificationEnabled,
      })
    }
  }, [portal, settingsForm])

  const portalUrl = portal
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/portal/${portal.portalToken}`
    : ''

  const handleToggle = async () => {
    if (!portal) return
    setSaving(true)
    try {
      await updatePortalSettings(selectedFolderId, { enabled: !portal.enabled })
      toast.success(portal.enabled ? 'Portal disabled' : 'Portal enabled')
    } catch (error) {
      toast.error('Failed to update portal')
    } finally {
      setSaving(false)
    }
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(portalUrl)
    setCopied(true)
    toast.success('Portal link copied')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSaveSettings = settingsForm.handleSubmit(async (values) => {
    setSaving(true)
    try {
      await updatePortalSettings(selectedFolderId, values)
      toast.success('Portal settings updated')
    } catch (error) {
      toast.error('Failed to update settings')
    } finally {
      setSaving(false)
    }
  })

  const handleUpdatePin = pinForm.handleSubmit(async (values) => {
    setUpdatingPin(true)
    try {
      await updatePortalPin(selectedFolderId, values.pin)
      toast.success('PIN updated')
      pinForm.reset({ pin: '' })
      setShowPinInput(false)
    } catch (error) {
      toast.error('Failed to update PIN')
    } finally {
      setUpdatingPin(false)
    }
  })

  const handleRegenerateToken = async () => {
    setSaving(true)
    try {
      await regeneratePortalToken(selectedFolderId)
      toast.success('Portal link regenerated', {
        description: 'The old link will no longer work.',
      })
    } catch (error) {
      toast.error('Failed to regenerate link')
    } finally {
      setSaving(false)
    }
  }

  const handleFolderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const fid = e.target.value
    setSelectedFolderId(fid)
    const folder = rootFolders.find((f) => f.id === fid)
    setSelectedFolderName(folder?.name ?? '')
    // Reset portal state for new folder
    setPortal(null)
    setShowPinInput(false)
  }

  return (
    <Dialog
      open={controlledOpen}
      onOpenChange={controlledOnOpenChange}
    >
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GlobeIcon className="size-4" />
            Portal Settings
          </DialogTitle>
          <DialogDescription>
            Configure external collaborator access to a College/School folder.
          </DialogDescription>
        </DialogHeader>

        {/* College / School Selector */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium flex items-center gap-1.5">
            <SchoolIcon className="size-3.5" />
            College / School
          </label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            value={selectedFolderId}
            onChange={handleFolderChange}
          >
            <option value="">Select a College / School…</option>
            {rootFolders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Each main College/School folder can have its own Portal.
          </p>
        </div>

        <Separator />

        {!selectedFolderId ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <SchoolIcon className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Select a College / School above to configure its Portal.
            </p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner className="size-6" />
          </div>
        ) : portal ? (
          <div className="flex flex-col gap-5">
            {/* Status */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <ShieldIcon className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Portal Access</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={portal.enabled ? 'default' : 'secondary'}>
                  {portal.enabled ? 'Enabled' : 'Disabled'}
                </Badge>
                <Button
                  variant={portal.enabled ? 'destructive' : 'default'}
                  size="sm"
                  onClick={handleToggle}
                  disabled={saving}
                >
                  {portal.enabled ? 'Disable' : 'Enable'}
                </Button>
              </div>
            </div>

            {/* Portal URL */}
            {portal.enabled && (
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Portal URL</label>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={portalUrl}
                    className="text-xs font-mono flex-1"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopy}
                    aria-label="Copy link"
                  >
                    {copied ? <CheckIcon /> : <ClipboardIcon />}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => window.open(portalUrl, '_blank')}
                    aria-label="Open portal"
                  >
                    <ExternalLinkIcon />
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  className="self-start"
                  onClick={handleRegenerateToken}
                  disabled={saving}
                >
                  Regenerate link
                </Button>
              </div>
            )}

            <Separator />

            {/* PIN */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <KeyIcon className="size-3.5" />
                  Access PIN
                </label>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => setShowPinInput(!showPinInput)}
                >
                  {showPinInput ? 'Cancel' : 'Update PIN'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Collaborators must enter this PIN to access the portal.
                The PIN is never stored in plain text.
              </p>
              {showPinInput && (
                <form onSubmit={handleUpdatePin} className="flex items-start gap-2">
                  <Field
                    className="flex-1"
                    data-invalid={!!pinForm.formState.errors.pin || undefined}
                  >
                    <Input
                      type="password"
                      placeholder="Enter new PIN (4–8 digits)"
                      maxLength={8}
                      {...pinForm.register('pin')}
                    />
                    <FieldError errors={[pinForm.formState.errors.pin]} />
                  </Field>
                  <Button type="submit" size="default" disabled={updatingPin}>
                    {updatingPin && <Spinner data-icon="inline-start" />}
                    Save
                  </Button>
                </form>
              )}
            </div>

            <Separator />

            {/* Settings form */}
            <form onSubmit={handleSaveSettings} className="flex flex-col gap-4">
              <FieldGroup>
                <Field
                  data-invalid={
                    !!settingsForm.formState.errors.collaboratorEmail || undefined
                  }
                >
                  <FieldLabel htmlFor="collaboratorEmail">
                    Collaborator Email <span className="text-destructive">*</span>
                  </FieldLabel>
                  <Input
                    id="collaboratorEmail"
                    type="email"
                    placeholder="collaborator@company.com"
                    {...settingsForm.register('collaboratorEmail')}
                  />
                  <FieldDescription>
                    Required. The collaborator must sign in with this email to access the portal.
                  </FieldDescription>
                  <FieldError
                    errors={[settingsForm.formState.errors.collaboratorEmail]}
                  />
                </Field>

                <Field orientation="horizontal">
                  <Checkbox
                    id="notificationEnabled"
                    checked={settingsForm.watch('notificationEnabled')}
                    onCheckedChange={(checked) =>
                      settingsForm.setValue(
                        'notificationEnabled',
                        checked === true,
                      )
                    }
                  />
                  <FieldLabel htmlFor="notificationEnabled" className="font-normal">
                    Email notifications on portal access
                  </FieldLabel>
                </Field>
              </FieldGroup>

              <DialogFooter>
                <Button type="submit" disabled={saving}>
                  {saving && <Spinner data-icon="inline-start" />}
                  Update Settings
                </Button>
              </DialogFooter>
            </form>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
