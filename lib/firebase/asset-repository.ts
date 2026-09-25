import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './client'
import { COLLECTIONS, type Asset, type AssetCategory } from '@/lib/models/types'
import { storage } from '@/lib/storage'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assetsCol(workspaceId: string) {
  return collection(getDb(), COLLECTIONS.workspaces, workspaceId, COLLECTIONS.assets)
}

function assetDoc(workspaceId: string, assetId: string) {
  return doc(getDb(), COLLECTIONS.workspaces, workspaceId, COLLECTIONS.assets, assetId)
}

function toIso(ts: unknown): string {
  if (ts instanceof Timestamp) return ts.toDate().toISOString()
  if (typeof ts === 'string') return ts
  return new Date().toISOString()
}

function mapAsset(snap: import('firebase/firestore').DocumentSnapshot): Asset | null {
  if (!snap.exists()) return null
  const d = snap.data()!
  return {
    id: snap.id,
    workspaceId: d.workspaceId ?? '',
    name: d.name ?? '',
    category: d.category ?? 'image',
    url: d.url ?? '',
    driveFileId: d.driveFileId ?? '',
    uploadStatus: d.uploadStatus ?? 'uploaded',
    mimeType: d.mimeType ?? '',
    sizeBytes: d.sizeBytes ?? 0,
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
  }
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

export async function uploadAsset(
  workspaceId: string,
  file: File,
  category: AssetCategory = 'image',
): Promise<Asset> {
  // Validate file before upload
  const { validateAssetFile } = await import('@/lib/validation')
  const validation = validateAssetFile(file)
  if (!validation.valid) {
    throw new Error(validation.error)
  }

  // Create Firestore doc first with 'pending' status
  const docRef = await addDoc(assetsCol(workspaceId), {
    workspaceId,
    name: file.name,
    category,
    url: '',
    driveFileId: '',
    uploadStatus: 'pending',
    mimeType: file.type,
    sizeBytes: file.size,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  try {
    // Upload to Google Drive via storage provider
    const result = await storage.upload(workspaceId, file, 'assets')

    // Update Firestore doc with Drive reference
    await updateDoc(assetDoc(workspaceId, docRef.id), {
      url: result.url,
      driveFileId: result.fileId,
      uploadStatus: 'uploaded',
      updatedAt: serverTimestamp(),
    })

    return {
      id: docRef.id,
      workspaceId,
      name: file.name,
      category,
      url: result.url,
      driveFileId: result.fileId,
      uploadStatus: 'uploaded',
      mimeType: file.type,
      sizeBytes: file.size,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  } catch (error) {
    // Mark as failed in Firestore
    await updateDoc(assetDoc(workspaceId, docRef.id), {
      uploadStatus: 'failed',
      updatedAt: serverTimestamp(),
    }).catch(() => {
      // If even the status update fails, delete the orphan doc
      deleteDoc(assetDoc(workspaceId, docRef.id)).catch(() => {})
    })
    throw error
  }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteAsset(workspaceId: string, assetId: string, driveFileId?: string): Promise<void> {
  // Delete from Drive first if we have a file ID
  if (driveFileId) {
    try {
      await storage.delete(driveFileId)
    } catch (error) {
      console.warn('[deleteAsset] Drive delete failed, continuing with Firestore delete:', error)
    }
  }

  await deleteDoc(assetDoc(workspaceId, assetId))
}

// ---------------------------------------------------------------------------
// Subscribe
// ---------------------------------------------------------------------------

export function subscribeAssets(
  workspaceId: string,
  onChange: (assets: Asset[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    assetsCol(workspaceId),
    (snap) => {
      const assets = snap.docs
        .map(mapAsset)
        .filter((a): a is Asset => a !== null)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      onChange(assets)
    },
    onError,
  )
}
