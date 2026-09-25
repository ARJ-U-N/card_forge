import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type DocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './client'
import { COLLECTIONS, type Member } from '@/lib/models/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function membersCol(workspaceId: string) {
  return collection(getDb(), COLLECTIONS.workspaces, workspaceId, COLLECTIONS.members)
}

function memberDoc(workspaceId: string, memberId: string) {
  return doc(getDb(), COLLECTIONS.workspaces, workspaceId, COLLECTIONS.members, memberId)
}

function toIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString()
  return new Date().toISOString()
}

function mapMember(snap: DocumentSnapshot<DocumentData>): Member | null {
  const d = snap.data()
  if (!d) return null
  return {
    id: snap.id,
    workspaceId: d.workspaceId ?? '',
    folderId: d.folderId ?? '',
    subfolderId: d.subfolderId ?? null,
    firstName: d.firstName ?? '',
    lastName: d.lastName ?? '',
    dateOfBirth: d.dateOfBirth ?? '',
    title: d.title ?? '',
    gender: d.gender ?? '',
    employeeId: d.employeeId ?? '',
    idNumber: d.idNumber ?? '',
    department: d.department ?? '',
    hireDate: d.hireDate ?? '',
    expireDate: d.expireDate ?? '',
    parentPhone: d.parentPhone ?? '',
    branch: d.branch ?? '',
    roomId: d.roomId ?? '',
    profileImage: d.profileImage ?? '',
    signature: d.signature ?? '',
    fingerprint: d.fingerprint ?? '',
    divisionLogo: d.divisionLogo ?? '',
    rowNumber: typeof d.rowNumber === 'number' ? d.rowNumber : undefined,
    customFields: d.customFields ?? {},
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
  }
}

// ---------------------------------------------------------------------------
// Row number generation (per-subfolder sequence)
// ---------------------------------------------------------------------------

/**
 * Get the next available row number for a given folder + subfolder combination.
 * Row numbers are per-subfolder: Class 8 → 1,2,3; Class 9 → 1,2,3 etc.
 * When subfolderId is null, numbers are scoped to root-level members of the folder.
 */
export async function getNextRowNumber(
  workspaceId: string,
  folderId: string,
  subfolderId: string | null,
): Promise<number> {
  const constraints = [
    where('folderId', '==', folderId),
    orderBy('rowNumber', 'desc'),
    limit(1),
  ]
  if (subfolderId) {
    constraints.splice(1, 0, where('subfolderId', '==', subfolderId))
  } else {
    constraints.splice(1, 0, where('subfolderId', '==', null))
  }
  const q = query(membersCol(workspaceId), ...constraints)
  const snap = await getDocs(q)
  if (snap.empty) return 1
  const maxRow = snap.docs[0].data().rowNumber
  return (typeof maxRow === 'number' ? maxRow : 0) + 1
}

// ---------------------------------------------------------------------------
// Single-member CRUD
// ---------------------------------------------------------------------------

export type MemberInput = Omit<Member, 'id' | 'createdAt' | 'updatedAt'>

export async function createMember(
  workspaceId: string,
  data: Omit<MemberInput, 'workspaceId'>,
): Promise<string> {
  const ref = await addDoc(membersCol(workspaceId), {
    ...data,
    workspaceId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateMember(
  workspaceId: string,
  memberId: string,
  data: Partial<Omit<MemberInput, 'workspaceId'>>,
): Promise<void> {
  await updateDoc(memberDoc(workspaceId, memberId), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteMember(
  workspaceId: string,
  memberId: string,
): Promise<void> {
  await deleteDoc(memberDoc(workspaceId, memberId))
}

// ---------------------------------------------------------------------------
// Batch operations
// ---------------------------------------------------------------------------

export async function deleteMembers(
  workspaceId: string,
  memberIds: string[],
): Promise<void> {
  const db = getDb()
  const batch = writeBatch(db)
  for (const id of memberIds) {
    batch.delete(memberDoc(workspaceId, id))
  }
  await batch.commit()
}

export async function moveMembers(
  workspaceId: string,
  memberIds: string[],
  targetFolderId: string,
  targetSubfolderId: string | null = null,
): Promise<void> {
  const db = getDb()
  const batch = writeBatch(db)
  for (const id of memberIds) {
    batch.update(memberDoc(workspaceId, id), {
      folderId: targetFolderId,
      subfolderId: targetSubfolderId,
      updatedAt: serverTimestamp(),
    })
  }
  await batch.commit()
}

export async function createManyMembers(
  workspaceId: string,
  members: Omit<MemberInput, 'workspaceId'>[],
): Promise<number> {
  const db = getDb()
  // Firestore batches are limited to 500 operations
  const BATCH_SIZE = 450
  let created = 0

  for (let i = 0; i < members.length; i += BATCH_SIZE) {
    const chunk = members.slice(i, i + BATCH_SIZE)
    const batch = writeBatch(db)
    for (const m of chunk) {
      const ref = doc(membersCol(workspaceId))
      batch.set(ref, {
        ...m,
        workspaceId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    }
    await batch.commit()
    created += chunk.length
  }

  return created
}

// ---------------------------------------------------------------------------
// Real-time subscriptions
// ---------------------------------------------------------------------------

export function subscribeMembers(
  workspaceId: string,
  folderId: string,
  onChange: (members: Member[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(membersCol(workspaceId), where('folderId', '==', folderId))
  return onSnapshot(
    q,
    (snap) => {
      const members = snap.docs
        .map(mapMember)
        .filter((m): m is Member => m !== null)
      onChange(members)
    },
    onError,
  )
}

export function subscribeAllMembers(
  workspaceId: string,
  onChange: (members: Member[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    membersCol(workspaceId),
    (snap) => {
      const members = snap.docs
        .map(mapMember)
        .filter((m): m is Member => m !== null)
      onChange(members)
    },
    onError,
  )
}

export async function getMembersInFolder(
  workspaceId: string,
  folderId: string,
): Promise<Member[]> {
  const q = query(membersCol(workspaceId), where('folderId', '==', folderId))
  const snap = await getDocs(q)
  return snap.docs.map(mapMember).filter((m): m is Member => m !== null)
}
