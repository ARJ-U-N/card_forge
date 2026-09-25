'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Spinner } from '@/components/ui/spinner'
import { useAuth } from '@/components/providers/auth-provider'
import { usePortal } from '@/components/providers/portal-provider'
import { getAuthErrorMessage } from '@/lib/auth/auth-errors'

export function SignOutDialog({ trigger }: { trigger: React.ReactElement }) {
  const { signOut } = useAuth()
  const { isPortalUser, portalToken, clearPortalSession } = usePortal()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)

  async function handleSignOut(event: React.MouseEvent) {
    event.preventDefault()
    setIsSigningOut(true)
    try {
      if (isPortalUser) {
        clearPortalSession()
      }
      await signOut()
      toast.success('Signed out')
      if (isPortalUser && portalToken) {
        router.replace(`/portal/${portalToken}`)
      } else {
        router.replace('/sign-in')
      }
    } catch (error) {
      setIsSigningOut(false)
      toast.error('Could not sign out', {
        description: getAuthErrorMessage(error),
      })
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sign out of CardForge?</AlertDialogTitle>
          <AlertDialogDescription>
            You&apos;ll need to sign in again to access your workspace. Any
            unsaved changes will be lost.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSigningOut}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleSignOut} disabled={isSigningOut}>
            {isSigningOut && <Spinner data-icon="inline-start" />}
            Sign out
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
