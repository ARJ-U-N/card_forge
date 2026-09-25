import type { Metadata } from 'next'
import { DesignerGetStarted } from '@/components/designer/designer-get-started'

export const metadata: Metadata = { title: 'Designer' }

export default function DesignerPage() {
  return <DesignerGetStarted />
}
