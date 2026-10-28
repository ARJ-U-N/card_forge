/**
 * Local photo resolution service.
 *
 * Retrieves confirmed photo assignments from IndexedDB, locates the
 * corresponding files through mapped local directory handles, and
 * provides temporary browser-readable object URLs.
 *
 * This module is the bridge between Phase 3 (matching & assignment
 * persistence) and future rendering integration. It does NOT modify
 * Firestore, Google Drive, member documents, saved designs, or the
 * local filesystem.
 *
 * Browser-only. Do not import from server components or API routes.
 */

import type { LocalFolderMapping, PhotoAssignment } from './local-photo-db'
import { getFolderMapping, getPhotoAssignments } from './local-photo-db'
import { checkPermission, revokePreviewUrl } from './local-photo-service'

// ---------------------------------------------------------------------------
// Resolution status types
// ---------------------------------------------------------------------------

/**
 * Discriminated union tag for resolution outcomes.
 *
 * Each status maps to a distinct failure mode so that future UI code
 * can present an appropriate message or recovery action.
 */
export type ResolutionStatus =
  | 'resolved'            // File read successfully; url is available
  | 'no-assignment'       // No confirmed assignment exists for this member + column
  | 'permission-required' // Mapping exists but directory permission must be re-granted
  | 'mapping-unavailable' // No mapping exists for this class + image column
  | 'file-missing'        // Assignment exists but the assigned file is absent
  | 'read-failed'         // Browser could not read the assigned file
  | 'storage-error'       // IndexedDB could not retrieve required data

// ---------------------------------------------------------------------------
// Resolution result types
// ---------------------------------------------------------------------------

/** Successful resolution: a temporary object URL is available. */
export interface ResolvedPhoto {
  status: 'resolved'
  /** Temporary blob: URL for the current file contents. */
  url: string
  /** The member's Firestore document ID. */
  memberId: string
  /** The image column this assignment belongs to. */
  imageColumnName: string
  /** The matched filename in the local directory. */
  filename: string
  /** How the match was originally established. */
  matchMethod: PhotoAssignment['matchMethod']
}

/** Resolution failed — no URL available. */
export interface UnresolvedPhoto {
  status: Exclude<ResolutionStatus, 'resolved'>
  /** The member's Firestore document ID. */
  memberId: string
  /** The image column that was requested. */
  imageColumnName: string
  /** Human-readable reason for the failure. */
  reason: string
}

/** A single resolution outcome. */
export type PhotoResolutionResult = ResolvedPhoto | UnresolvedPhoto

// ---------------------------------------------------------------------------
// Resolution session
// ---------------------------------------------------------------------------

/**
 * A resolution session owns the temporary blob URLs it creates and
 * provides a method to release them when the caller is finished.
 *
 * Usage:
 * ```ts
 * const session = createResolutionSession()
 * const result = await session.resolve(folderId, subfolderId, 'profileImage', memberId)
 * // ... use result.url in an <img> ...
 * session.dispose() // revokes all URLs created by this session
 * ```
 *
 * A new session re-reads files from the directory handle, so externally
 * replaced file contents are picked up automatically.
 */
export interface ResolutionSession {
  /**
   * Resolve a single local photo assignment.
   *
   * Looks up the confirmed assignment, locates the file through the
   * mapped directory handle, and returns a temporary object URL.
   *
   * Does NOT prompt for permissions. If permission is needed, returns
   * a `permission-required` result so the UI can offer the existing
   * reconnect flow.
   */
  resolve(
    folderId: string,
    subfolderId: string,
    imageColumnName: string,
    memberId: string,
  ): Promise<PhotoResolutionResult>

  /**
   * Resolve multiple members for a single class and image column.
   *
   * Returns one result per requested member ID. Failed lookups do NOT
   * abort the batch — each member gets its own status.
   *
   * Reuses the directory handle and permission check across the batch
   * to avoid redundant I/O.
   */
  resolveBatch(
    folderId: string,
    subfolderId: string,
    imageColumnName: string,
    memberIds: string[],
  ): Promise<PhotoResolutionResult[]>

  /**
   * Revoke all temporary object URLs created by this session.
   *
   * After calling dispose(), previously returned URLs become invalid.
   * Do not call while a consumer is actively rendering from them.
   *
   * Safe to call multiple times.
   */
  dispose(): void
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Create a new resolution session.
 *
 * Each session maintains its own set of temporary object URLs and
 * re-reads files from directory handles (so externally replaced file
 * contents are picked up by a new session).
 */
export function createResolutionSession(): ResolutionSession {
  /** All blob URLs created by this session, for cleanup. */
  const ownedUrls: string[] = []

  /** Whether dispose() has been called. */
  let disposed = false

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /**
   * Retrieve the mapping and check permission.
   * Returns the mapping handle or an unresolved result.
   */
  async function getMappingWithPermission(
    folderId: string,
    subfolderId: string,
    imageColumnName: string,
    memberId: string,
  ): Promise<
    | { ok: true; mapping: LocalFolderMapping }
    | { ok: false; result: UnresolvedPhoto }
  > {
    let mapping: LocalFolderMapping | null
    try {
      mapping = await getFolderMapping(folderId, subfolderId, imageColumnName)
    } catch (err) {
      return {
        ok: false,
        result: {
          status: 'storage-error',
          memberId,
          imageColumnName,
          reason:
            'Could not read folder mapping from local storage: ' +
            (err instanceof Error ? err.message : String(err)),
        },
      }
    }

    if (!mapping) {
      return {
        ok: false,
        result: {
          status: 'mapping-unavailable',
          memberId,
          imageColumnName,
          reason:
            'No local folder is mapped for this image column. ' +
            'Use the Local Photos dialog to map a folder first.',
        },
      }
    }

    const permStatus = await checkPermission(mapping.directoryHandle)
    if (permStatus === 'permission-needed') {
      return {
        ok: false,
        result: {
          status: 'permission-required',
          memberId,
          imageColumnName,
          reason:
            'Directory access permission has expired. ' +
            'Use the Local Photos dialog to reconnect the folder.',
        },
      }
    }
    if (permStatus === 'unavailable') {
      return {
        ok: false,
        result: {
          status: 'mapping-unavailable',
          memberId,
          imageColumnName,
          reason:
            'The mapped directory is no longer accessible. ' +
            'Use the Local Photos dialog to remap the folder.',
        },
      }
    }

    return { ok: true, mapping }
  }

  /**
   * Read a specific file from a directory handle and create an object URL.
   */
  async function readFileAsUrl(
    dirHandle: FileSystemDirectoryHandle,
    filename: string,
    memberId: string,
    imageColumnName: string,
    matchMethod: PhotoAssignment['matchMethod'],
  ): Promise<PhotoResolutionResult> {
    let fileHandle: FileSystemFileHandle
    try {
      fileHandle = await dirHandle.getFileHandle(filename)
    } catch (err) {
      // NotFoundError means the file was removed or renamed
      if (err instanceof DOMException && err.name === 'NotFoundError') {
        return {
          status: 'file-missing',
          memberId,
          imageColumnName,
          reason: `Assigned file "${filename}" was not found in the mapped directory.`,
        }
      }
      return {
        status: 'read-failed',
        memberId,
        imageColumnName,
        reason:
          `Could not access file "${filename}": ` +
          (err instanceof Error ? err.message : String(err)),
      }
    }

    try {
      const file = await fileHandle.getFile()
      const url = URL.createObjectURL(file)
      ownedUrls.push(url)
      return {
        status: 'resolved',
        url,
        memberId,
        imageColumnName,
        filename,
        matchMethod,
      }
    } catch (err) {
      return {
        status: 'read-failed',
        memberId,
        imageColumnName,
        reason:
          `Could not read file "${filename}": ` +
          (err instanceof Error ? err.message : String(err)),
      }
    }
  }

  // -----------------------------------------------------------------------
  // Single resolve
  // -----------------------------------------------------------------------

  async function resolve(
    folderId: string,
    subfolderId: string,
    imageColumnName: string,
    memberId: string,
  ): Promise<PhotoResolutionResult> {
    if (disposed) {
      return {
        status: 'read-failed',
        memberId,
        imageColumnName,
        reason: 'This resolution session has been disposed.',
      }
    }

    // 1. Retrieve the assignment
    let assignments: PhotoAssignment[]
    try {
      assignments = await getPhotoAssignments(
        folderId,
        subfolderId,
        imageColumnName,
      )
    } catch (err) {
      return {
        status: 'storage-error',
        memberId,
        imageColumnName,
        reason:
          'Could not read photo assignments from local storage: ' +
          (err instanceof Error ? err.message : String(err)),
      }
    }

    const assignment = assignments.find((a) => a.memberId === memberId)
    if (!assignment) {
      return {
        status: 'no-assignment',
        memberId,
        imageColumnName,
        reason: 'No local photo has been assigned to this member for this image column.',
      }
    }

    // 2. Retrieve the mapping and check permission
    const mappingResult = await getMappingWithPermission(
      folderId,
      subfolderId,
      imageColumnName,
      memberId,
    )
    if (!mappingResult.ok) return mappingResult.result

    // 3. Read the file and create an object URL
    return readFileAsUrl(
      mappingResult.mapping.directoryHandle,
      assignment.filename,
      memberId,
      imageColumnName,
      assignment.matchMethod,
    )
  }

  // -----------------------------------------------------------------------
  // Batch resolve
  // -----------------------------------------------------------------------

  async function resolveBatch(
    folderId: string,
    subfolderId: string,
    imageColumnName: string,
    memberIds: string[],
  ): Promise<PhotoResolutionResult[]> {
    if (disposed) {
      return memberIds.map((memberId) => ({
        status: 'read-failed' as const,
        memberId,
        imageColumnName,
        reason: 'This resolution session has been disposed.',
      }))
    }

    if (memberIds.length === 0) return []

    // 1. Load all assignments for this scope in a single read
    let assignments: PhotoAssignment[]
    try {
      assignments = await getPhotoAssignments(
        folderId,
        subfolderId,
        imageColumnName,
      )
    } catch (err) {
      const reason =
        'Could not read photo assignments from local storage: ' +
        (err instanceof Error ? err.message : String(err))
      return memberIds.map((memberId) => ({
        status: 'storage-error' as const,
        memberId,
        imageColumnName,
        reason,
      }))
    }

    const assignmentByMember = new Map(
      assignments.map((a) => [a.memberId, a]),
    )

    // 2. Check mapping and permission once for the entire batch
    // Use the first member ID for error reporting context
    const mappingResult = await getMappingWithPermission(
      folderId,
      subfolderId,
      imageColumnName,
      memberIds[0],
    )

    // If mapping/permission failed, every member gets that same status
    // (except members with no assignment — they get 'no-assignment')
    if (!mappingResult.ok) {
      return memberIds.map((memberId) => {
        if (!assignmentByMember.has(memberId)) {
          return {
            status: 'no-assignment' as const,
            memberId,
            imageColumnName,
            reason:
              'No local photo has been assigned to this member for this image column.',
          }
        }
        return {
          ...mappingResult.result,
          memberId,
        }
      })
    }

    const { mapping } = mappingResult

    // 3. Resolve each member independently
    const results: PhotoResolutionResult[] = []
    for (const memberId of memberIds) {
      const assignment = assignmentByMember.get(memberId)
      if (!assignment) {
        results.push({
          status: 'no-assignment',
          memberId,
          imageColumnName,
          reason:
            'No local photo has been assigned to this member for this image column.',
        })
        continue
      }

      const fileResult = await readFileAsUrl(
        mapping.directoryHandle,
        assignment.filename,
        memberId,
        imageColumnName,
        assignment.matchMethod,
      )
      results.push(fileResult)
    }

    return results
  }

  // -----------------------------------------------------------------------
  // Dispose
  // -----------------------------------------------------------------------

  function dispose(): void {
    if (disposed) return
    disposed = true
    for (const url of ownedUrls) {
      revokePreviewUrl(url)
    }
    ownedUrls.length = 0
  }

  // -----------------------------------------------------------------------
  // Return session object
  // -----------------------------------------------------------------------

  return { resolve, resolveBatch, dispose }
}

// ---------------------------------------------------------------------------
// Convenience: check whether a result was successful
// ---------------------------------------------------------------------------

/** Type guard: narrows a PhotoResolutionResult to ResolvedPhoto. */
export function isResolved(
  result: PhotoResolutionResult,
): result is ResolvedPhoto {
  return result.status === 'resolved'
}

/** Type guard: narrows a PhotoResolutionResult to UnresolvedPhoto. */
export function isUnresolved(
  result: PhotoResolutionResult,
): result is UnresolvedPhoto {
  return result.status !== 'resolved'
}

