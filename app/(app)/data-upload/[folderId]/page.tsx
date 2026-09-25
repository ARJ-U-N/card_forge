import type { Metadata } from 'next'
import { FolderDetailView } from '@/components/data-upload/folder-detail-view'

export const metadata: Metadata = { title: 'Folder' }

export default async function FolderPage({
  params,
}: {
  params: Promise<{ folderId: string }>
}) {
  const { folderId } = await params
  return <FolderDetailView folderId={folderId} />
}
