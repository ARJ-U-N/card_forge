import type { Metadata } from 'next'
import { AssetLibraryView } from '@/components/assets/asset-library-view'

export const metadata: Metadata = { title: 'Asset Library' }

export default function AssetsPage() {
  return <AssetLibraryView />
}
