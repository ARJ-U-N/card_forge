import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
  type DocumentData,
  type DocumentSnapshot,
  type Unsubscribe,
  type UpdateData,
} from 'firebase/firestore'
import { getDb } from './client'
import { COLLECTIONS, type User, type Workspace } from '@/lib/models/types'

function toIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString()
  return new Date().toISOString()
}

function mapUser(snap: DocumentSnapshot<DocumentData>): User | null {
  const data = snap.data()
  if (!data) return null
  return {
    id: snap.id,
    email: data.email,
    authUid: data.authUid,
    workspaceId: data.workspaceId,
    role: data.role,
    portalFolderId: data.portalFolderId ?? undefined,
    profile: {
      displayName: data.profile?.displayName ?? '',
      photoURL: data.profile?.photoURL ?? null,
      jobTitle: data.profile?.jobTitle ?? null,
      phone: data.profile?.phone ?? null,
    },
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  }
}

function mapWorkspace(snap: DocumentSnapshot<DocumentData>): Workspace | null {
  const data = snap.data()
  if (!data) return null
  return {
    id: snap.id,
    name: data.name,
    ownerId: data.ownerId,
    memberIds: data.memberIds ?? [],
    plan: data.plan ?? 'free',
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  }
}

/**
 * Creates the user document and their personal workspace atomically.
 * Called once right after Firebase Auth account creation.
 */
export async function provisionUserAndWorkspace(input: {
  uid: string
  email: string
  displayName: string
  workspaceName: string
}): Promise<void> {
  const db = getDb()
  const batch = writeBatch(db)
  const workspaceRef = doc(db, COLLECTIONS.workspaces, input.uid)
  const userRef = doc(db, COLLECTIONS.users, input.uid)

  batch.set(workspaceRef, {
    name: input.workspaceName,
    ownerId: input.uid,
    memberIds: [input.uid],
    plan: 'free',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  batch.set(userRef, {
    email: input.email,
    authUid: input.uid,
    workspaceId: workspaceRef.id,
    role: 'owner',
    profile: {
      displayName: input.displayName,
      photoURL: null,
      jobTitle: null,
      phone: null,
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  await batch.commit()
}

export async function getUser(uid: string): Promise<User | null> {
  const snap = await getDoc(doc(getDb(), COLLECTIONS.users, uid))
  return mapUser(snap)
}

export async function getWorkspace(id: string): Promise<Workspace | null> {
  const snap = await getDoc(doc(getDb(), COLLECTIONS.workspaces, id))
  return mapWorkspace(snap)
}

export function subscribeToUser(
  uid: string,
  onChange: (user: User | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(getDb(), COLLECTIONS.users, uid),
    (snap) => onChange(mapUser(snap)),
    onError,
  )
}

export function subscribeToWorkspace(
  id: string,
  onChange: (workspace: Workspace | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(getDb(), COLLECTIONS.workspaces, id),
    (snap) => onChange(mapWorkspace(snap)),
    onError,
  )
}

export async function updateUserProfile(
  uid: string,
  profile: Partial<User['profile']>,
): Promise<void> {
  const updates: UpdateData<DocumentData> = { updatedAt: serverTimestamp() }
  for (const [key, value] of Object.entries(profile)) {
    updates[`profile.${key}`] = value
  }
  await updateDoc(doc(getDb(), COLLECTIONS.users, uid), updates)
}

export async function updateWorkspaceName(
  id: string,
  name: string,
): Promise<void> {
  await updateDoc(doc(getDb(), COLLECTIONS.workspaces, id), {
    name,
    updatedAt: serverTimestamp(),
  })
}
