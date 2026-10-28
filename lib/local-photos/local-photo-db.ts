/**
 * IndexedDB persistence for local photo folder mappings.
 *
 * Stores FileSystemDirectoryHandle references so the browser can regain
 * access to mapped directories after page refreshes (subject to permission
 * re-grants by the user).
 *
 * This module is browser-only. Do not import from server components or
 * API routes.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A persisted mapping from a class image column to a local directory. */
export interface LocalFolderMapping {
  /** Deterministic key: `${folderId}::${subfolderId}::${imageColumnName}` */
  key: string
  /** Root College folder Firestore document ID */
  folderId: string
  /** Class subfolder Firestore document ID */
  subfolderId: string
  /** Image column name (table column heading) */
  imageColumnName: string
  /** The persisted FileSystemDirectoryHandle (structured-cloneable) */
  directoryHandle: FileSystemDirectoryHandle
  /** Human-readable directory name from handle.name */
  directoryName: string
  /** ISO timestamp when the mapping was first created */
  createdAt: string
  /** ISO timestamp when the mapping was last updated */
  updatedAt: string
}

/** How a photo was matched to a member. */
export type AssignmentMatchMethod = 'member-id' | 'name-match' | 'drive-filename'

/**
 * A confirmed photo assignment: one local file → one member,
 * scoped to a specific class and image column.
 */
export interface PhotoAssignment {
  /**
   * Deterministic key:
   * `${folderId}::${subfolderId}::${imageColumnName}::${memberId}`
   */
  key: string
  /** Root College folder Firestore document ID */
  folderId: string
  /** Class subfolder Firestore document ID */
  subfolderId: string
  /** Image column name (table column heading) */
  imageColumnName: string
  /** The matched member's Firestore document ID */
  memberId: string
  /** The matched filename (basename with extension) */
  filename: string
  /** How the match was established */
  matchMethod: AssignmentMatchMethod
  /** ISO timestamp of last update */
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DB_NAME = 'cardforge-local-photos'
const DB_VERSION = 2
const STORE_FOLDER_MAPPINGS = 'folder-mappings'
const STORE_PHOTO_ASSIGNMENTS = 'photo-assignments'

/** @deprecated Alias kept for internal references. */
const STORE_NAME = STORE_FOLDER_MAPPINGS

// ---------------------------------------------------------------------------
// Key derivation
// ---------------------------------------------------------------------------

/**
 * Build a deterministic IndexedDB key from the mapping identity.
 * Two different classes or colleges with the same visible folder name
 * will never collide because Firestore document IDs are globally unique.
 */
export function getMappingKey(
  folderId: string,
  subfolderId: string,
  imageColumnName: string,
): string {
  return `${folderId}::${subfolderId}::${imageColumnName}`
}

/**
 * Build a deterministic IndexedDB key for a photo assignment.
 */
export function getAssignmentKey(
  folderId: string,
  subfolderId: string,
  imageColumnName: string,
  memberId: string,
): string {
  return `${folderId}::${subfolderId}::${imageColumnName}::${memberId}`
}

// ---------------------------------------------------------------------------
// Database access
// ---------------------------------------------------------------------------

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment.'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_FOLDER_MAPPINGS)) {
        db.createObjectStore(STORE_FOLDER_MAPPINGS, { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains(STORE_PHOTO_ASSIGNMENTS)) {
        db.createObjectStore(STORE_PHOTO_ASSIGNMENTS, { keyPath: 'key' })
      }
    }

    request.onsuccess = () => resolve(request.result)

    request.onerror = () => {
      dbPromise = null
      reject(request.error ?? new Error('Failed to open IndexedDB.'))
    }

    request.onblocked = () => {
      dbPromise = null
      reject(
        new Error(
          'IndexedDB is blocked by another tab. Close other CardForge tabs and try again.',
        ),
      )
    }
  })

  return dbPromise
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

/**
 * Save or update a folder mapping in IndexedDB.
 * If a mapping with the same logical identity already exists it is replaced,
 * preserving the original `createdAt` timestamp.
 */
export async function saveFolderMapping(
  mapping: Omit<LocalFolderMapping, 'key' | 'createdAt' | 'updatedAt'>,
): Promise<LocalFolderMapping> {
  const db = await openDB()
  const key = getMappingKey(
    mapping.folderId,
    mapping.subfolderId,
    mapping.imageColumnName,
  )
  const now = new Date().toISOString()

  // Preserve createdAt from any existing record
  const existing = await getFolderMappingByKey(db, key)

  const record: LocalFolderMapping = {
    ...mapping,
    key,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.put(record)
    req.onsuccess = () => resolve(record)
    req.onerror = () =>
      reject(req.error ?? new Error('Failed to save folder mapping.'))
  })
}

/**
 * Retrieve a single folder mapping by its logical identity.
 * Returns null if no mapping exists for this combination.
 */
export async function getFolderMapping(
  folderId: string,
  subfolderId: string,
  imageColumnName: string,
): Promise<LocalFolderMapping | null> {
  const db = await openDB()
  const key = getMappingKey(folderId, subfolderId, imageColumnName)
  return getFolderMappingByKey(db, key)
}

/**
 * Retrieve all folder mappings for a given College folder and subfolder.
 * Returns one mapping per image column that has been mapped.
 */
export async function getMappingsForSubfolder(
  folderId: string,
  subfolderId: string,
): Promise<LocalFolderMapping[]> {
  const db = await openDB()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.getAll()
    req.onsuccess = () => {
      const all = (req.result as LocalFolderMapping[]) ?? []
      resolve(
        all.filter(
          (m) => m.folderId === folderId && m.subfolderId === subfolderId,
        ),
      )
    }
    req.onerror = () =>
      reject(req.error ?? new Error('Failed to read folder mappings.'))
  })
}

/**
 * Remove a folder mapping from IndexedDB.
 * Does NOT delete any files from the filesystem or Google Drive.
 */
export async function removeFolderMapping(
  folderId: string,
  subfolderId: string,
  imageColumnName: string,
): Promise<void> {
  const db = await openDB()
  const key = getMappingKey(folderId, subfolderId, imageColumnName)

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.delete(key)
    req.onsuccess = () => resolve()
    req.onerror = () =>
      reject(req.error ?? new Error('Failed to remove folder mapping.'))
  })
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Read a single record by its raw key. */
function getFolderMappingByKey(
  db: IDBDatabase,
  key: string,
): Promise<LocalFolderMapping | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.get(key)
    req.onsuccess = () => resolve((req.result as LocalFolderMapping) ?? null)
    req.onerror = () =>
      reject(req.error ?? new Error('Failed to read folder mapping.'))
  })
}

// ---------------------------------------------------------------------------
// Photo Assignment CRUD
// ---------------------------------------------------------------------------

/**
 * Save a batch of photo assignments for a specific class and image column.
 * Replaces all existing assignments for that scope.
 *
 * Does NOT modify Firestore, Google Drive, or local files.
 */
export async function savePhotoAssignments(
  folderId: string,
  subfolderId: string,
  imageColumnName: string,
  assignments: Array<
    Pick<PhotoAssignment, 'memberId' | 'filename' | 'matchMethod'>
  >,
): Promise<void> {
  const db = await openDB()
  const now = new Date().toISOString()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PHOTO_ASSIGNMENTS, 'readwrite')
    const store = tx.objectStore(STORE_PHOTO_ASSIGNMENTS)

    // First, remove all existing assignments for this scope.
    // We read all, filter, delete stale, then add new ones.
    const getAllReq = store.getAll()
    getAllReq.onsuccess = () => {
      const all = (getAllReq.result as PhotoAssignment[]) ?? []
      const prefix = `${folderId}::${subfolderId}::${imageColumnName}::`
      for (const existing of all) {
        if (existing.key.startsWith(prefix)) {
          store.delete(existing.key)
        }
      }

      // Write all new assignments
      for (const a of assignments) {
        const key = getAssignmentKey(
          folderId,
          subfolderId,
          imageColumnName,
          a.memberId,
        )
        const record: PhotoAssignment = {
          key,
          folderId,
          subfolderId,
          imageColumnName,
          memberId: a.memberId,
          filename: a.filename,
          matchMethod: a.matchMethod,
          updatedAt: now,
        }
        store.put(record)
      }
    }

    getAllReq.onerror = () =>
      reject(getAllReq.error ?? new Error('Failed to save photo assignments.'))

    tx.oncomplete = () => resolve()
    tx.onerror = () =>
      reject(tx.error ?? new Error('Failed to save photo assignments.'))
  })
}

/**
 * Retrieve all photo assignments for a specific class and image column.
 */
export async function getPhotoAssignments(
  folderId: string,
  subfolderId: string,
  imageColumnName: string,
): Promise<PhotoAssignment[]> {
  const db = await openDB()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PHOTO_ASSIGNMENTS, 'readonly')
    const store = tx.objectStore(STORE_PHOTO_ASSIGNMENTS)
    const req = store.getAll()
    req.onsuccess = () => {
      const all = (req.result as PhotoAssignment[]) ?? []
      resolve(
        all.filter(
          (a) =>
            a.folderId === folderId &&
            a.subfolderId === subfolderId &&
            a.imageColumnName === imageColumnName,
        ),
      )
    }
    req.onerror = () =>
      reject(req.error ?? new Error('Failed to read photo assignments.'))
  })
}

/**
 * Remove all photo assignments for a specific class and image column.
 * Does NOT delete any files or modify Firestore.
 */
export async function clearPhotoAssignments(
  folderId: string,
  subfolderId: string,
  imageColumnName: string,
): Promise<void> {
  const db = await openDB()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PHOTO_ASSIGNMENTS, 'readwrite')
    const store = tx.objectStore(STORE_PHOTO_ASSIGNMENTS)
    const req = store.getAll()
    req.onsuccess = () => {
      const all = (req.result as PhotoAssignment[]) ?? []
      const prefix = `${folderId}::${subfolderId}::${imageColumnName}::`
      for (const existing of all) {
        if (existing.key.startsWith(prefix)) {
          store.delete(existing.key)
        }
      }
    }
    req.onerror = () =>
      reject(req.error ?? new Error('Failed to clear photo assignments.'))
    tx.oncomplete = () => resolve()
    tx.onerror = () =>
      reject(tx.error ?? new Error('Failed to clear photo assignments.'))
  })
}

/**
 * Count the number of photo assignments for a specific class and image column.
 * Useful for showing assignment status in the UI without loading full records.
 */
export async function countPhotoAssignments(
  folderId: string,
  subfolderId: string,
  imageColumnName: string,
): Promise<number> {
  const assignments = await getPhotoAssignments(
    folderId,
    subfolderId,
    imageColumnName,
  )
  return assignments.length
}

