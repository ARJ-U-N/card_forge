import type { Metadata } from 'next'
import { DataUploadView } from '@/components/data-upload/data-upload-view'

export const metadata: Metadata = { title: 'Data Upload' }

export default function DataUploadPage() {
  return <DataUploadView />
}

