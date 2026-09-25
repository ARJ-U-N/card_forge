import type { Metadata } from 'next'
import { BulkGeneratorView } from '@/components/bulk-generator/bulk-generator-view'

export const metadata: Metadata = { title: 'Bulk Generator' }

export default function BulkGeneratorPage() {
  return <BulkGeneratorView />
}
