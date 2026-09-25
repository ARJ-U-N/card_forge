'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { signInWithCustomToken } from 'firebase/auth'
import {
  AlertCircleIcon,
  CheckCircleIcon,
  KeyIcon,
  LockIcon,
  MailIcon,
  ShieldIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { BrandMark } from '@/components/brand-mark'
import {
  getPortalByToken,
  verifyPortalPin,
} from '@/lib/firebase/portal-repository'
import { getFirebaseAuth } from '@/lib/firebase/client'
import { setSessionCookie } from '@/lib/auth/session-cookie'
import type { Portal } from '@/lib/models/types'

type PortalState =
  | 'loading'
  | 'invalid'
  | 'disabled'
  | 'email-entry'
  | 'email-verifying'
  | 'email-error'
  | 'pin-entry'
  | 'verifying'
  | 'pin-error'
  | 'signing-in'
  | 'redirecting'

interface Props {
  token: string
}

export function PortalPage({ token }: Props) {
  const router = useRouter()
  const [state, setState] = useState<PortalState>('loading')
  const [portal, setPortal] = useState<Portal | null>(null)
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [pin, setPin] = useState('')
  const [pinAttempts, setPinAttempts] = useState(0)
  const [customToken, setCustomToken] = useState('')

  // Look up portal by token
  useEffect(() => {
    async function lookup() {
      try {
        const p = await getPortalByToken(token)
        if (!p) {
          setState('invalid')
          return
        }
        setPortal(p)
        if (!p.enabled) {
          setState('disabled')
          return
        }
        if (!p.collaboratorEmail) {
          setState('invalid')
          return
        }
        setState('email-entry')
      } catch {
        setState('invalid')
      }
    }
    lookup()
  }, [token])

  // Step 1: Verify email via server-side API
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    setState('email-verifying')
    setEmailError('')

    try {
      const res = await fetch('/api/portal/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portalToken: token, email: email.trim() }),
      })

      const data = await res.json()

      if (!res.ok) {
        setEmailError(data.error || 'Verification failed.')
        setState('email-error')
        return
      }

      // Store custom token for use after PIN verification
      setCustomToken(data.customToken)
      setState('pin-entry')
    } catch {
      setEmailError('Network error. Please try again.')
      setState('email-error')
    }
  }

  // Step 2: Verify PIN, then sign into Firebase Auth
  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!portal || !pin.trim()) return

    setState('verifying')
    try {
      const valid = await verifyPortalPin(portal.id, pin)
      if (!valid) {
        setPinAttempts((p) => p + 1)
        setState('pin-error')
        setPin('')
        return
      }

      // PIN valid — sign into Firebase Auth with custom token
      setState('signing-in')
      const auth = getFirebaseAuth()
      await signInWithCustomToken(auth, customToken)
      setSessionCookie(false) // session-only cookie

      // Store portal metadata in sessionStorage for the PortalProvider
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('cf_portal_token', token)
        sessionStorage.setItem(
          'cf_portal_folder_name',
          portal.folderName || 'College Portal',
        )
      }

      setState('redirecting')
      router.replace('/dashboard')
    } catch {
      setState('pin-error')
    }
  }

  // Derive display name from portal
  const collegeName = portal?.folderName || 'College Portal'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <BrandMark className="size-7" />
            <span className="font-semibold tracking-tight text-slate-800">
              CardForge
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <ShieldIcon className="size-3" />
              Collaborator Portal
            </Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        {state === 'loading' && (
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <Spinner className="size-8" />
            <p className="text-sm text-muted-foreground">
              Verifying portal access…
            </p>
          </div>
        )}

        {state === 'invalid' && (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircleIcon className="size-8 text-destructive" />
            </div>
            <h1 className="text-xl font-semibold">Invalid Portal Link</h1>
            <p className="max-w-sm text-sm text-muted-foreground">
              This portal link is invalid or has expired. Please contact the
              workspace owner for a new link.
            </p>
          </div>
        )}

        {state === 'disabled' && (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-muted">
              <LockIcon className="size-8 text-muted-foreground" />
            </div>
            <h1 className="text-xl font-semibold">Portal Disabled</h1>
            <p className="max-w-sm text-sm text-muted-foreground">
              The workspace owner has disabled collaborator access.
              Please contact them to re-enable it.
            </p>
          </div>
        )}

        {/* Step 1: Email verification */}
        {(state === 'email-entry' ||
          state === 'email-verifying' ||
          state === 'email-error') && (
          <div className="mx-auto grid max-w-3xl gap-8 lg:grid-cols-2">
            {/* Info panel */}
            <div className="flex flex-col justify-center gap-6">
              <div className="flex flex-col gap-3">
                <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
                  <ShieldIcon className="size-6 text-primary" />
                </div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {collegeName}
                </h1>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  You&apos;ve been invited to manage data through a
                  secure portal. Sign in with your registered email to
                  verify your identity.
                </p>
              </div>
              <div className="flex flex-col gap-2 rounded-lg border bg-white/60 p-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <MailIcon className="size-3.5" />
                  <span>Email verified via Firebase Auth</span>
                </div>
                <div className="flex items-center gap-2">
                  <KeyIcon className="size-3.5" />
                  <span>PIN as additional portal credential</span>
                </div>
                <div className="flex items-center gap-2">
                  <ShieldIcon className="size-3.5" />
                  <span>Data scoped to your College only</span>
                </div>
              </div>
            </div>

            {/* Email form */}
            <Card className="self-center">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MailIcon className="size-4" />
                  Verify Your Email
                </CardTitle>
                <CardDescription>
                  Enter the email address registered by the workspace owner
                  for this portal.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={handleEmailSubmit}
                  className="flex flex-col gap-4"
                >
                  {state === 'email-error' && emailError && (
                    <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                      <AlertCircleIcon className="size-4 shrink-0" />
                      <span>{emailError}</span>
                    </div>
                  )}

                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      if (state === 'email-error') setState('email-entry')
                    }}
                    disabled={state === 'email-verifying'}
                    autoFocus
                  />

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={
                      !email.trim() || state === 'email-verifying'
                    }
                  >
                    {state === 'email-verifying' && (
                      <Spinner data-icon="inline-start" />
                    )}
                    {state === 'email-verifying'
                      ? 'Verifying…'
                      : 'Continue'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 2: PIN entry */}
        {(state === 'pin-entry' ||
          state === 'verifying' ||
          state === 'pin-error' ||
          state === 'signing-in') && (
          <div className="mx-auto grid max-w-3xl gap-8 lg:grid-cols-2">
            {/* Info panel */}
            <div className="flex flex-col justify-center gap-6">
              <div className="flex flex-col gap-3">
                <div className="flex size-12 items-center justify-center rounded-xl bg-green-500/10">
                  <CheckCircleIcon className="size-6 text-green-600" />
                </div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  Email Verified
                </h1>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">{email}</span>
                  {' '}has been verified. Now enter the access PIN
                  provided by the workspace owner.
                </p>
              </div>
              <div className="flex flex-col gap-2 rounded-lg border bg-white/60 p-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <LockIcon className="size-3.5" />
                  <span>End-to-end secured access</span>
                </div>
                <div className="flex items-center gap-2">
                  <ShieldIcon className="size-3.5" />
                  <span>Data scoped to your College only</span>
                </div>
                <div className="flex items-center gap-2">
                  <KeyIcon className="size-3.5" />
                  <span>PIN is never stored in plain text</span>
                </div>
              </div>
            </div>

            {/* PIN form */}
            <Card className="self-center">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <KeyIcon className="size-4" />
                  Enter Access PIN
                </CardTitle>
                <CardDescription>
                  Enter the numeric PIN provided by the workspace owner.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={handlePinSubmit}
                  className="flex flex-col gap-4"
                >
                  {state === 'pin-error' && (
                    <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                      <AlertCircleIcon className="size-4 shrink-0" />
                      <span>
                        Invalid PIN.{' '}
                        {pinAttempts >= 3
                          ? 'Too many attempts. Please contact the workspace owner.'
                          : 'Please try again.'}
                      </span>
                    </div>
                  )}

                  <Input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={8}
                    placeholder="••••"
                    value={pin}
                    onChange={(e) => {
                      setPin(e.target.value.replace(/\D/g, ''))
                      if (state === 'pin-error') setState('pin-entry')
                    }}
                    disabled={
                      state === 'verifying' ||
                      state === 'signing-in' ||
                      pinAttempts >= 5
                    }
                    autoFocus
                    className="text-center text-lg tracking-[0.5em] font-mono"
                  />

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={
                      !pin.trim() ||
                      pin.length < 4 ||
                      state === 'verifying' ||
                      state === 'signing-in' ||
                      pinAttempts >= 5
                    }
                  >
                    {(state === 'verifying' || state === 'signing-in') && (
                      <Spinner data-icon="inline-start" />
                    )}
                    {state === 'signing-in'
                      ? 'Signing in…'
                      : state === 'verifying'
                        ? 'Verifying…'
                        : 'Access Portal'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

        {state === 'redirecting' && (
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <Spinner className="size-8" />
            <p className="text-sm text-muted-foreground">
              Access granted — redirecting to dashboard…
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t bg-white/50 py-4 text-center text-xs text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} CardForge — Secure Collaborator Portal</p>
      </footer>
    </div>
  )
}
