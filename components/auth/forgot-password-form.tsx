'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { ArrowLeftIcon, MailCheckIcon, OctagonXIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { FirebaseConfigNotice } from '@/components/auth/firebase-config-notice'
import { useAuth } from '@/components/providers/auth-provider'
import {
  forgotPasswordSchema,
  type ForgotPasswordValues,
} from '@/lib/validation/auth'
import { getAuthErrorMessage } from '@/lib/auth/auth-errors'

export function ForgotPasswordForm() {
  const { resetPassword, isConfigured } = useAuth()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })

  const onSubmit = form.handleSubmit(async ({ email }) => {
    setFormError(null)
    setIsSubmitting(true)
    try {
      await resetPassword(email)
      setSentTo(email)
      toast.success('Reset email sent', { description: `Check ${email}.` })
    } catch (error) {
      const message = getAuthErrorMessage(error)
      setFormError(message)
      toast.error('Could not send reset email', { description: message })
    } finally {
      setIsSubmitting(false)
    }
  })

  const { errors } = form.formState

  if (sentTo) {
    return (
      <div className="flex flex-col gap-6">
        <Alert role="status">
          <MailCheckIcon />
          <AlertTitle>Check your inbox</AlertTitle>
          <AlertDescription>
            If an account exists for <strong>{sentTo}</strong>, a password reset
            link is on its way. It expires in one hour.
          </AlertDescription>
        </Alert>
        <div className="flex flex-col gap-3">
          <Button
            variant="outline"
            onClick={() => {
              setSentTo(null)
              form.reset()
            }}
          >
            Use a different email
          </Button>
          <Button variant="ghost" render={<Link href="/sign-in" />}>
            <ArrowLeftIcon data-icon="inline-start" />
            Back to sign in
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Reset your password
        </h1>
        <p className="text-sm text-muted-foreground">
          Enter the email for your account and we&apos;ll send a secure reset
          link.
        </p>
      </div>

      <FirebaseConfigNotice />

      {formError && (
        <Alert variant="destructive" role="alert">
          <OctagonXIcon />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
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
              disabled={isSubmitting || !isConfigured}
              {...form.register('email')}
            />
            <FieldError errors={[errors.email]} />
          </Field>
        </FieldGroup>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={isSubmitting || !isConfigured}
        >
          {isSubmitting && <Spinner data-icon="inline-start" />}
          {isSubmitting ? 'Sending…' : 'Send reset link'}
        </Button>

        <FieldDescription className="text-center">
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-4"
          >
            <ArrowLeftIcon className="size-3.5" aria-hidden="true" />
            Back to sign in
          </Link>
        </FieldDescription>
      </form>
    </div>
  )
}
