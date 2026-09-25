import type { Metadata } from 'next'
import { MyDesignsView } from '@/components/designer/my-designs-view'

export const metadata: Metadata = { title: 'My Designs' }

export default function MyDesignsPage() {
  return <MyDesignsView />
}
