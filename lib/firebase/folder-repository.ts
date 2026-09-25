import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  onSnapshot,
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
import { COLLECTIONS, type Folder } from '@/lib/models/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function foldersCol(workspaceId: string) {
  return collection(getDb(), COLLECTIONS.workspaces, workspaceId, COLLECTIONS.folders)
}

function folderDoc(workspaceId: string, folderId: string) {
  return doc(getDb(), COLLECTIONS.workspaces, workspaceId, COLLECTIONS.folders, folderId)
}

function membersCol(workspaceId: string) {
  return collection(getDb(), COLLECTIONS.workspaces, workspaceId, COLLECTIONS.members)
}

function toIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString()
  return new Date().toISOString()
}

function mapFolder(snap: DocumentSnapshot<DocumentData>): Folder | null {
  const d = snap.data()
  if (!d) return null
  return {
    id: snap.id,
    workspaceId: d.workspaceId,
    name: d.name,
    parentFolderId: d.parentFolderId ?? null,
    tableColumns: Array.isArray(d.tableColumns) ? d.tableColumns : undefined,
    tableColumnTypes: d.tableColumnTypes && typeof d.tableColumnTypes === 'object' ? d.tableColumnTypes : undefined,
    folderTotalNumber: typeof d.folderTotalNumber === 'number' ? d.folderTotalNumber : undefined,
    submittedAt: d.submittedAt ? toIso(d.submittedAt) : null,
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
  }
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createFolder(
  workspaceId: string,
  name: string,
  parentFolderId: string | null = null,
  folderTotalNumber: number = 0,
): Promise<string> {
  console.log("CREATE FOLDER")
  console.log("workspaceId:", workspaceId)
  console.log("name:", name)
  console.log("collection path:", [
    COLLECTIONS.workspaces,
    workspaceId,
    COLLECTIONS.folders,
  ])

  const ref = await addDoc(foldersCol(workspaceId), {
    workspaceId,
    name,
    parentFolderId,
    folderTotalNumber,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return ref.id
}

export async function renameFolder(
  workspaceId: string,
  folderId: string,
  name: string,
): Promise<void> {
  await updateDoc(folderDoc(workspaceId, folderId), {
    name,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Mark a main College folder as submitted/locked.
 * After this, non-owner users cannot edit the folder or its data.
 */
export async function submitFolder(
  workspaceId: string,
  folderId: string,
): Promise<void> {
  await updateDoc(folderDoc(workspaceId, folderId), {
    submittedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

/**
 * Set or update a folder's table column definitions.
 * When `merge` is true, new columns are appended without removing existing ones.
 */
export async function updateFolderColumns(
  workspaceId: string,
  folderId: string,
  columns: string[],
  merge = false,
  columnTypes?: Record<string, 'text' | 'image'>,
): Promise<void> {
  if (merge) {
    const folder = await getFolder(workspaceId, folderId)
    const existing = folder?.tableColumns ?? []
    const existingSet = new Set(existing)
    const merged = [...existing, ...columns.filter((c) => !existingSet.has(c))]
    const updateData: Record<string, unknown> = {
      tableColumns: merged,
      updatedAt: serverTimestamp(),
    }
    if (columnTypes) updateData.tableColumnTypes = columnTypes
    await updateDoc(folderDoc(workspaceId, folderId), updateData)
  } else {
    const updateData: Record<string, unknown> = {
      tableColumns: columns,
      updatedAt: serverTimestamp(),
    }
    if (columnTypes) updateData.tableColumnTypes = columnTypes
    await updateDoc(folderDoc(workspaceId, folderId), updateData)
  }
}

/**
 * Deletes a folder, all its subfolders, and all members that belong to
 * the folder or any of its subfolders. Uses batched writes (max 500 ops).
 */
export async function deleteFolder(
  workspaceId: string,
  folderId: string,
): Promise<void> {
  const db = getDb()

  // 1. Collect subfolder IDs
  const subSnap = await getDocs(
    query(foldersCol(workspaceId), where('parentFolderId', '==', folderId)),
  )
  const allFolderIds = [folderId, ...subSnap.docs.map((d) => d.id)]

  // 2. Collect members in any of these folders
  const memberSnap = await getDocs(
    query(membersCol(workspaceId), where('folderId', 'in', allFolderIds.slice(0, 30))),
  )

  // 3. Batch delete everything
  const batch = writeBatch(db)
  for (const id of allFolderIds) {
    batch.delete(folderDoc(workspaceId, id))
  }
  for (const memberDoc of memberSnap.docs) {
    batch.delete(memberDoc.ref)
  }
  await batch.commit()
}

export async function getFolder(
  workspaceId: string,
  folderId: string,
): Promise<Folder | null> {
  const snap = await getDoc(folderDoc(workspaceId, folderId))
  return mapFolder(snap)
}

// ---------------------------------------------------------------------------
// Real-time subscriptions
// ---------------------------------------------------------------------------

export function subscribeFolders(
  workspaceId: string,
  onChange: (folders: Folder[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    foldersCol(workspaceId),
    (snap) => {
      const folders = snap.docs
        .map(mapFolder)
        .filter((f): f is Folder => f !== null)
      onChange(folders)
    },
    onError,
  )
}

// ---------------------------------------------------------------------------
// Counts
// ---------------------------------------------------------------------------

export async function getFolderMemberCount(
  workspaceId: string,
  folderId: string,
): Promise<number> {
  const q = query(membersCol(workspaceId), where('folderId', '==', folderId))
  const snap = await getCountFromServer(q)
  return snap.data().count
}

export async function getSubfolderCount(
  workspaceId: string,
  parentFolderId: string,
): Promise<number> {
  const q = query(
    foldersCol(workspaceId),
    where('parentFolderId', '==', parentFolderId),
  )
  const snap = await getCountFromServer(q)
  return snap.data().count
}
