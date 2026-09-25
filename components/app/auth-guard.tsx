'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/components/providers/auth-provider'
import { AppShellSkeleton } from '@/components/app/app-shell-skeleton'

/**
 * Client-side gate for the authenticated area. The proxy already bounces
 * cookie-less visitors; this guard handles the real Firebase session state,
 * including expired sessions and the initial hydration window.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { status } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`)
    }
  }, [status, router, pathname])

  if (status !== 'authenticated') {
    return <AppShellSkeleton />
  }

  return <>{children}</>
}
