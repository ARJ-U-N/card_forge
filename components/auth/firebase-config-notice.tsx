'use client'

import { TriangleAlertIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useAuth } from '@/components/providers/auth-provider'

export function FirebaseConfigNotice() {
  const { isConfigured } = useAuth()
  if (isConfigured) return null
  return (
    <Alert variant="destructive">
      <TriangleAlertIcon />
      <AlertTitle>Firebase is not configured</AlertTitle>
      <AlertDescription>
        Add the <code className="font-mono">NEXT_PUBLIC_FIREBASE_*</code>{' '}
        environment variables from your Firebase project settings, then reload.
        Authentication is disabled until then.
      </AlertDescription>
    </Alert>
  )
}
