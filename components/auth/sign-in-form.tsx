'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { CircleCheckIcon, OctagonXIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { PasswordInput } from '@/components/auth/password-input'
import { FirebaseConfigNotice } from '@/components/auth/firebase-config-notice'
import { useAuth } from '@/components/providers/auth-provider'
import { signInSchema, type SignInValues } from '@/lib/validation/auth'
import {
  getAuthErrorMessage,
  isInvalidCredentialError,
} from '@/lib/auth/auth-errors'

type SubmitState = 'idle' | 'submitting' | 'success'

export function SignInForm() {
  const { signIn, isConfigured } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '', remember: true },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    setSubmitState('submitting')
    try {
      await signIn(values)
      setSubmitState('success')
      toast.success('Signed in', { description: 'Welcome back.' })
      const next = searchParams.get('next')
      router.replace(next && next.startsWith('/') ? next : '/dashboard')
    } catch (error) {
      setSubmitState('idle')
      const message = getAuthErrorMessage(error)
      setFormError(message)
      if (isInvalidCredentialError(error)) {
        form.setError('password', { message: ' ' })
        form.setError('email', { message: ' ' })
      }
      toast.error('Sign in failed', { description: message })
    }
  })

  const isBusy = submitState !== 'idle'
  const { errors } = form.formState

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Sign in to your workspace
        </h1>
        <p className="text-sm text-muted-foreground">
          Enter your credentials to manage templates, members and card runs.
        </p>
      </div>

      <FirebaseConfigNotice />

      {formError && submitState === 'idle' && (
        <Alert variant="destructive" role="alert">
          <OctagonXIcon />
          <AlertTitle>Unable to sign in</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      {submitState === 'success' && (
        <Alert role="status">
          <CircleCheckIcon />
          <AlertTitle>Signed in</AlertTitle>
          <AlertDescription>Redirecting to your dashboard…</AlertDescription>
        </Alert>
      )}

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <FieldGroup>
          <Field data-invalid={!!errors.email || undefined}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              aria-invalid={!!errors.email}
              disabled={isBusy || !isConfigured}
              {...form.register('email')}
            />
            <FieldError errors={[errors.email]} />
          </Field>

          <Field data-invalid={!!errors.password || undefined}>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Link
                href="/forgot-password"
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              placeholder="Your password"
              aria-invalid={!!errors.password}
              disabled={isBusy || !isConfigured}
              {...form.register('password')}
            />
            <FieldError errors={[errors.password]} />
          </Field>

          <Field orientation="horizontal">
            <Controller
              control={form.control}
              name="remember"
              render={({ field }) => (
                <Checkbox
                  id="remember"
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                  disabled={isBusy}
                />
              )}
            />
            <FieldLabel htmlFor="remember" className="font-normal">
              Remember me on this device
            </FieldLabel>
          </Field>
        </FieldGroup>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={isBusy || !isConfigured}
        >
          {submitState === 'submitting' && <Spinner data-icon="inline-start" />}
          {submitState === 'submitting' ? 'Signing in…' : 'Sign in'}
        </Button>

        <FieldDescription className="text-center">
          New to CardForge?{' '}
          <Link
            href="/create-account"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Create an account
          </Link>
        </FieldDescription>
      </form>
    </div>
  )
}
