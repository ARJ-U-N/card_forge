import type { Metadata } from 'next'
import { CardDesigner } from '@/components/designer/card-designer'

export const metadata: Metadata = { title: 'Card Designer' }

export default async function CardDesignerPage({
  params,
}: {
  params: Promise<{ designId: string }>
}) {
  const { designId } = await params
  return <CardDesigner designId={designId} />
}
