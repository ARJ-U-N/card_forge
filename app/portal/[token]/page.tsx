import type { Metadata } from 'next'
import { PortalPage } from '@/components/portal/portal-page'

export const metadata: Metadata = {
  title: 'Collaborator Portal · CardForge',
  description: 'Secure collaborator access to workspace data.',
}

export default async function PortalRoute({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <PortalPage token={token} />
}
