'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  BuildingIcon,
  KeyRoundIcon,
  LogOutIcon,
  SaveIcon,
  ShieldIcon,
  UserIcon,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { useAuth } from '@/components/providers/auth-provider'
import { SignOutDialog } from '@/components/app/sign-out-dialog'
import {
  getWorkspace,
  updateUserProfile,
  updateWorkspaceName,
} from '@/lib/firebase/repositories'
import { formatDate, getInitials } from '@/lib/utils'
import type { Workspace } from '@/lib/models/types'

export function ProfileView() {
  const { user, firebaseUser, isProfileLoading } = useAuth()
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [loadingWs, setLoadingWs] = useState(true)

  // Editable fields
  const [displayName, setDisplayName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [phone, setPhone] = useState('')
  const [wsName, setWsName] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingWs, setSavingWs] = useState(false)

  useEffect(() => {
    if (user) {
      setDisplayName(user.profile.displayName)
      setJobTitle(user.profile.jobTitle ?? '')
      setPhone(user.profile.phone ?? '')
    }
  }, [user])

  useEffect(() => {
    if (!user?.workspaceId) return
    setLoadingWs(true)
    getWorkspace(user.workspaceId).then((ws) => {
      setWorkspace(ws)
      setWsName(ws?.name ?? '')
      setLoadingWs(false)
    })
  }, [user?.workspaceId])

  const handleSaveProfile = useCallback(async () => {
    if (!user) return
    setSavingProfile(true)
    try {
      await updateUserProfile(user.id, {
        displayName: displayName.trim() || user.profile.displayName,
        jobTitle: jobTitle.trim() || null,
        phone: phone.trim() || null,
      })
      toast.success('Profile updated')
    } catch {
      toast.error('Failed to update profile')
    } finally {
      setSavingProfile(false)
    }
  }, [user, displayName, jobTitle, phone])

  const handleSaveWorkspace = useCallback(async () => {
    if (!workspace) return
    setSavingWs(true)
    try {
      await updateWorkspaceName(workspace.id, wsName.trim() || workspace.name)
      toast.success('Workspace updated')
    } catch {
      toast.error('Failed to update workspace')
    } finally {
      setSavingWs(false)
    }
  }, [workspace, wsName])

  if (isProfileLoading || !user) {
    return (
      <div className="grid gap-6 max-w-2xl">
        <Skeleton className="h-48" />
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
    )
  }

  return (
    <div className="grid gap-6 max-w-2xl">
      {/* ── Profile Information ───────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-4">
          <Avatar className="size-16">
            <AvatarImage src={user.profile.photoURL ?? undefined} alt="" />
            <AvatarFallback className="bg-primary text-primary-foreground text-xl">
              {getInitials(user.profile.displayName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              <UserIcon className="size-4" />
              Profile Information
            </CardTitle>
            <CardDescription>Your personal details</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Display Name</label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Job Title</label>
              <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Not set" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Phone</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Not set" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Member Since</label>
              <Input value={formatDate(user.createdAt)} disabled />
            </div>
          </div>
          <div className="flex justify-end pt-4">
            <Button size="sm" onClick={handleSaveProfile} disabled={savingProfile}>
              {savingProfile ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}
              {savingProfile ? 'Saving…' : 'Save Profile'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Account Information ───────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRoundIcon className="size-4" />
            Account Information
          </CardTitle>
          <CardDescription>Authentication and account details</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <Input value={user.email} disabled />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Auth UID</label>
              <Input value={user.authUid} disabled className="font-mono text-xs" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Email Verified</label>
              <div className="flex items-center gap-2 h-9">
                <Badge variant={firebaseUser?.emailVerified ? 'default' : 'secondary'}>
                  {firebaseUser?.emailVerified ? 'Verified' : 'Pending'}
                </Badge>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Role</label>
              <div className="flex items-center gap-2 h-9">
                <Badge variant="outline" className="capitalize">
                  <ShieldIcon className="size-3 mr-1" />
                  {user.role}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Workspace Information ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BuildingIcon className="size-4" />
            Workspace Information
          </CardTitle>
          <CardDescription>Organization settings</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingWs ? (
            <Skeleton className="h-20" />
          ) : workspace ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Workspace Name</label>
                  <Input value={wsName} onChange={(e) => setWsName(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Workspace ID</label>
                  <Input value={workspace.id} disabled className="font-mono text-xs" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Plan</label>
                  <div className="flex items-center h-9">
                    <Badge variant="secondary" className="capitalize">{workspace.plan}</Badge>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Members</label>
                  <div className="flex items-center h-9 text-sm">{workspace.memberIds.length} member(s)</div>
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <Button size="sm" onClick={handleSaveWorkspace} disabled={savingWs}>
                  {savingWs ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}
                  {savingWs ? 'Saving…' : 'Save Workspace'}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Unable to load workspace.</p>
          )}
        </CardContent>
      </Card>

      {/* ── Sign Out ─────────────────────────────────────────────── */}
      <Card className="border-destructive/30">
        <CardContent className="flex items-center justify-between py-4">
          <div>
            <p className="text-sm font-medium">Sign out of your account</p>
            <p className="text-xs text-muted-foreground">You'll need to sign in again to access your workspace.</p>
          </div>
          <SignOutDialog
            trigger={
              <Button variant="destructive" size="sm">
                <LogOutIcon data-icon="inline-start" />
                Sign Out
              </Button>
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}
