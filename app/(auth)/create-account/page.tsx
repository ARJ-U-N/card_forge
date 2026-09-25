import type { Metadata } from 'next'
import { CreateAccountForm } from '@/components/auth/create-account-form'

export const metadata: Metadata = { title: 'Create account' }

export default function CreateAccountPage() {
  return <CreateAccountForm />
}
