import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './client'
import { COLLECTIONS, type EditRequest } from '@/lib/models/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requestsCol(workspaceId: string) {
  return collection(getDb(), COLLECTIONS.workspaces, workspaceId, COLLECTIONS.editRequests)
}

function requestDoc(workspaceId: string, requestId: string) {
  return doc(getDb(), COLLECTIONS.workspaces, workspaceId, COLLECTIONS.editRequests, requestId)
}

function toIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString()
  return new Date().toISOString()
}

function mapRequest(snap: DocumentSnapshot<DocumentData>): EditRequest | null {
  const d = snap.data()
  if (!d) return null
  return {
    id: snap.id,
    workspaceId: d.workspaceId ?? '',
    folderId: d.folderId ?? '',
    folderName: d.folderName ?? '',
    requesterUserId: d.requesterUserId ?? '',
    requesterEmail: d.requesterEmail ?? '',
    status: d.status ?? 'pending',
    createdAt: toIso(d.createdAt),
    reviewedAt: d.reviewedAt ? toIso(d.reviewedAt) : null,
    reviewedBy: d.reviewedBy ?? null,
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Get the current pending request for a folder (if any). */
export async function getPendingRequest(
  workspaceId: string,
  folderId: string,
): Promise<EditRequest | null> {
  const q = query(
    requestsCol(workspaceId),
    where('folderId', '==', folderId),
    where('status', '==', 'pending'),
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  return mapRequest(snap.docs[0])
}

/** Subscribe to all edit requests for a workspace (admin view). */
export function subscribeEditRequests(
  workspaceId: string,
  onData: (requests: EditRequest[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(requestsCol(workspaceId))
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map(mapRequest).filter(Boolean) as EditRequest[]
      // Sort: pending first, then by date descending
      list.sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1
        if (b.status === 'pending' && a.status !== 'pending') return 1
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })
      onData(list)
    },
    onError,
  )
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Create a new edit-permission request. Returns the new request ID. */
export async function createEditRequest(
  workspaceId: string,
  folderId: string,
  folderName: string,
  requesterUserId: string,
  requesterEmail: string,
): Promise<string> {
  const ref = await addDoc(requestsCol(workspaceId), {
    workspaceId,
    folderId,
    folderName,
    requesterUserId,
    requesterEmail,
    status: 'pending',
    createdAt: serverTimestamp(),
    reviewedAt: null,
    reviewedBy: null,
  })
  return ref.id
}

/** Admin approves a request. */
export async function approveEditRequest(
  workspaceId: string,
  requestId: string,
  reviewerUserId: string,
): Promise<void> {
  await updateDoc(requestDoc(workspaceId, requestId), {
    status: 'approved',
    reviewedAt: serverTimestamp(),
    reviewedBy: reviewerUserId,
  })
}

/** Admin rejects a request. */
export async function rejectEditRequest(
  workspaceId: string,
  requestId: string,
  reviewerUserId: string,
): Promise<void> {
  await updateDoc(requestDoc(workspaceId, requestId), {
    status: 'rejected',
    reviewedAt: serverTimestamp(),
    reviewedBy: reviewerUserId,
  })
}
