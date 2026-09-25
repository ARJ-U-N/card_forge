import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
  type DocumentSnapshot,
} from 'firebase/firestore'
import { getDb } from './client'
import { COLLECTIONS, type ParentShare } from '@/lib/models/types'
import { generatePortalToken } from './portal-repository'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sharesCol() {
  return collection(getDb(), COLLECTIONS.parentShares)
}

function shareDoc(shareId: string) {
  return doc(getDb(), COLLECTIONS.parentShares, shareId)
}

function toIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString()
  return new Date().toISOString()
}

function mapShare(snap: DocumentSnapshot<DocumentData>): ParentShare | null {
  const d = snap.data()
  if (!d) return null
  return {
    id: snap.id,
    workspaceId: d.workspaceId ?? '',
    folderId: d.folderId ?? '',
    subfolderId: d.subfolderId ?? '',
    folderName: d.folderName ?? '',
    subfolderName: d.subfolderName ?? '',
    shareToken: d.shareToken ?? '',
    enabled: d.enabled ?? true,
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
  }
}

// ---------------------------------------------------------------------------
// CRUD — keyed by subfolderId (one share per subfolder)
// ---------------------------------------------------------------------------

/**
 * Get or create a parent share for a subfolder.
 * Reuses generatePortalToken() from portal-repository for the crypto token.
 */
export async function getOrCreateParentShare(
  workspaceId: string,
  folderId: string,
  subfolderId: string,
  folderName: string,
  subfolderName: string,
): Promise<ParentShare> {
  const ref = shareDoc(subfolderId)
  const snap = await getDoc(ref)
  if (snap.exists()) {
    return mapShare(snap)!
  }

  const token = generatePortalToken()
  const data = {
    workspaceId,
    folderId,
    subfolderId,
    folderName,
    subfolderName,
    shareToken: token,
    enabled: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  await setDoc(ref, data)
  const created = await getDoc(ref)
  return mapShare(created)!
}

export async function updateParentShare(
  subfolderId: string,
  updates: Partial<{ enabled: boolean }>,
): Promise<void> {
  await updateDoc(shareDoc(subfolderId), {
    ...updates,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Public lookup by token — no auth required.
 */
export async function getParentShareByToken(token: string): Promise<ParentShare | null> {
  const q = query(sharesCol(), where('shareToken', '==', token))
  const snap = await getDocs(q)
  if (snap.empty) return null
  return mapShare(snap.docs[0])
}
