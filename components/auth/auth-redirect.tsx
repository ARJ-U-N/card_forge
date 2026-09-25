'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/components/providers/auth-provider'

/** Sends already-authenticated visitors away from the auth pages. */
export function AuthRedirect() {
  const { status } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (status !== 'authenticated') return
    const next = searchParams.get('next')
    router.replace(next && next.startsWith('/') ? next : '/dashboard')
  }, [status, router, searchParams])

  return null
}
