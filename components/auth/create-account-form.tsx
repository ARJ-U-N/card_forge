'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { OctagonXIcon } from 'lucide-react'
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
import {
  createAccountSchema,
  type CreateAccountValues,
} from '@/lib/validation/auth'
import { getAuthErrorMessage } from '@/lib/auth/auth-errors'

export function CreateAccountForm() {
  const { createAccount, isConfigured } = useAuth()
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<CreateAccountValues>({
    resolver: zodResolver(createAccountSchema),
    defaultValues: {
      fullName: '',
      workspaceName: '',
      email: '',
      password: '',
      confirmPassword: '',
      acceptTerms: false,
    },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    setIsSubmitting(true)
    try {
      await createAccount(values)
      toast.success('Account created', {
        description: `Workspace "${values.workspaceName}" is ready.`,
      })
      router.replace('/dashboard')
    } catch (error) {
      setIsSubmitting(false)
      const message = getAuthErrorMessage(error)
      setFormError(message)
      toast.error('Could not create account', { description: message })
    }
  })

  const { errors } = form.formState
  const disabled = isSubmitting || !isConfigured

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Create your account
        </h1>
        <p className="text-sm text-muted-foreground">
          You&apos;ll be the owner of a new workspace. Invite teammates later.
        </p>
      </div>

      <FirebaseConfigNotice />

      {formError && (
        <Alert variant="destructive" role="alert">
          <OctagonXIcon />
          <AlertTitle>Could not create account</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <FieldGroup>
          <div className="grid gap-6 sm:grid-cols-2">
            <Field data-invalid={!!errors.fullName || undefined}>
              <FieldLabel htmlFor="fullName">Full name</FieldLabel>
              <Input
                id="fullName"
                autoComplete="name"
                placeholder="Alex Morgan"
                aria-invalid={!!errors.fullName}
                disabled={disabled}
                {...form.register('fullName')}
              />
              <FieldError errors={[errors.fullName]} />
            </Field>

            <Field data-invalid={!!errors.workspaceName || undefined}>
              <FieldLabel htmlFor="workspaceName">Workspace</FieldLabel>
              <Input
                id="workspaceName"
                autoComplete="organization"
                placeholder="Acme Corp"
                aria-invalid={!!errors.workspaceName}
                disabled={disabled}
                {...form.register('workspaceName')}
              />
              <FieldError errors={[errors.workspaceName]} />
            </Field>
          </div>

          <Field data-invalid={!!errors.email || undefined}>
            <FieldLabel htmlFor="email">Work email</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              aria-invalid={!!errors.email}
              disabled={disabled}
              {...form.register('email')}
            />
            <FieldError errors={[errors.email]} />
          </Field>

          <Field data-invalid={!!errors.password || undefined}>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              aria-invalid={!!errors.password}
              disabled={disabled}
              {...form.register('password')}
            />
            <FieldDescription>
              Use 8+ characters including at least one number.
            </FieldDescription>
            <FieldError errors={[errors.password]} />
          </Field>

          <Field data-invalid={!!errors.confirmPassword || undefined}>
            <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
            <PasswordInput
              id="confirmPassword"
              autoComplete="new-password"
              placeholder="Repeat your password"
              aria-invalid={!!errors.confirmPassword}
              disabled={disabled}
              {...form.register('confirmPassword')}
            />
            <FieldError errors={[errors.confirmPassword]} />
          </Field>

          <Field
            orientation="horizontal"
            data-invalid={!!errors.acceptTerms || undefined}
          >
            <Controller
              control={form.control}
              name="acceptTerms"
              render={({ field }) => (
                <Checkbox
                  id="acceptTerms"
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                  aria-invalid={!!errors.acceptTerms}
                  disabled={disabled}
                />
              )}
            />
            <div className="flex flex-col gap-1">
              <FieldLabel htmlFor="acceptTerms" className="font-normal">
                I agree to the{' '}
                <Link href="/privacy" className="underline underline-offset-4">
                  Privacy Policy
                </Link>
              </FieldLabel>
              <FieldError errors={[errors.acceptTerms]} />
            </div>
          </Field>
        </FieldGroup>

        <Button type="submit" size="lg" className="w-full" disabled={disabled}>
          {isSubmitting && <Spinner data-icon="inline-start" />}
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>

        <FieldDescription className="text-center">
          Already have an account?{' '}
          <Link
            href="/sign-in"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Sign in
          </Link>
        </FieldDescription>
      </form>
    </div>
  )
}
