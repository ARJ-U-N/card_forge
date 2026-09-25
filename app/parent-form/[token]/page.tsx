import type { Metadata } from 'next'
import { ParentFormPage } from '@/components/parent-form/parent-form-page'

export const metadata: Metadata = {
  title: 'Parent Details Form · CardForge',
  description: 'Submit your details for ID card generation.',
}

export default async function ParentFormRoute({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <ParentFormPage token={token} />
}
