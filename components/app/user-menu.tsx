'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { BuildingIcon, LogOutIcon, SchoolIcon, UserRoundIcon } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/components/providers/auth-provider'
import { usePortal } from '@/components/providers/portal-provider'
import { getAuthErrorMessage } from '@/lib/auth/auth-errors'
import { getInitials } from '@/lib/utils'

export function UserMenu() {
  const { user, firebaseUser, signOut } = useAuth()
  const { isPortalUser, portalFolderName, portalToken, clearPortalSession } = usePortal()
  const router = useRouter()

  const displayName =
    user?.profile.displayName || firebaseUser?.displayName || 'Account'
  const email = user?.email ?? firebaseUser?.email ?? ''
  const photoURL = user?.profile.photoURL ?? firebaseUser?.photoURL ?? undefined

  async function handleSignOut() {
    try {
      if (isPortalUser) {
        clearPortalSession()
        await signOut()
        if (portalToken) {
          router.replace(`/portal/${portalToken}`)
        } else {
          router.replace('/sign-in')
        }
      } else {
        await signOut()
        toast.success('Signed out')
        router.replace('/sign-in')
      }
    } catch (error) {
      toast.error('Could not sign out', {
        description: getAuthErrorMessage(error),
      })
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 px-2"
            aria-label="Open account menu"
          />
        }
      >
        <Avatar className="size-7">
          <AvatarImage src={photoURL} alt="" />
          <AvatarFallback className="bg-primary text-primary-foreground text-xs">
            {getInitials(displayName)}
          </AvatarFallback>
        </Avatar>
        <span className="hidden max-w-32 truncate text-sm md:inline">
          {displayName}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate font-medium">{displayName}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">
            {email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isPortalUser ? (
          /* Simplified menu for portal users */
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
              <SchoolIcon className="size-3.5" />
              {portalFolderName ?? 'College Portal'}
            </DropdownMenuLabel>
            <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
              <LogOutIcon />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuGroup>
        ) : (
          /* Full menu for regular users */
          <>
            <DropdownMenuGroup>
              <DropdownMenuItem render={<Link href="/profile" />}>
                <UserRoundIcon />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/workspace" />}>
                <BuildingIcon />
                Workspace
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
                <LogOutIcon />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
