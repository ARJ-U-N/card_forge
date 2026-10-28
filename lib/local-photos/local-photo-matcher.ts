/**
 * Local photo matching engine.
 *
 * Pure logic — no React, DOM, or IndexedDB dependencies.
 *
 * Matches local image filenames to member records using two strategies:
 *
 * **Priority A — Member-ID matching**
 * Parses filenames in the Phase 2 format `<SanitizedName>__<MemberId>.<ext>`
 * and matches the member ID against the provided set of class member IDs.
 *
 * **Priority B — Name matching**
 * Normalizes the filename (minus extension) and compares it against each
 * member's display name (from the selected name column) using a
 * case-insensitive, whitespace-collapsed comparison.
 *
 * This module is browser-only but has no browser API dependencies.
 * Do not import from server components or API routes.
 */

import type { Member } from '@/lib/models/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** How a match was established. */
export type MatchMethod = 'member-id' | 'name-match' | 'drive-filename'

/** A confirmed one-to-one match between a filename and a member. */
export interface PhotoMatch {
  /** The image filename (basename, with extension) */
  filename: string
  /** The matched member's Firestore document ID */
  memberId: string
  /** Which algorithm produced this match */
  method: MatchMethod
}

/** A filename that matched multiple members, or a member that matched multiple files. */
export interface AmbiguousMatch {
  /** The image filename */
  filename: string
  /** All member IDs this filename could belong to */
  candidateMemberIds: string[]
  /** Reason for the ambiguity */
  reason: 'duplicate-names' | 'multiple-files-for-member'
}

/** Complete result of running the matcher against a set of files and members. */
export interface MatchResult {
  /** Unambiguous matches (one file → one member) */
  matches: PhotoMatch[]
  /** Filenames or members with multiple candidates */
  ambiguous: AmbiguousMatch[]
  /** Members that have no matching file */
  missingMembers: Array<{ memberId: string; memberName: string }>
  /** Files that could not be matched to any member */
  unmatchedFiles: string[]
  /** Groups of filenames that appear to target the same member */
  duplicateFiles: Array<{ memberId: string; filenames: string[] }>
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Match local image filenames to member records.
 *
 * @param filenames     Array of image filenames from the local directory.
 * @param members       Array of Member records for the selected class (subfolder).
 * @param nameColumnKey The customFields key for the name column (e.g. "firstName").
 *                      Pass `undefined` to skip name matching entirely.
 */
export function matchPhotosToMembers(
  filenames: string[],
  members: Member[],
  nameColumnKey: string | undefined,
): MatchResult {
  const memberIdSet = new Set(members.map((m) => m.id))
  const memberById = new Map(members.map((m) => [m.id, m]))

  // Build a normalized-name → member IDs lookup for name matching
  const nameToMemberIds = new Map<string, string[]>()
  if (nameColumnKey) {
    for (const m of members) {
      const raw = m.customFields?.[nameColumnKey] ?? ''
      if (!raw.trim()) continue
      const norm = normalizeName(raw)
      const existing = nameToMemberIds.get(norm)
      if (existing) {
        existing.push(m.id)
      } else {
        nameToMemberIds.set(norm, [m.id])
      }
    }
  }

  // Track which members have been matched and by how many files
  const memberFileMap = new Map<string, string[]>() // memberId → filenames matched
  const matchedFiles = new Map<string, PhotoMatch>()  // filename → match
  const ambiguousFromNames: AmbiguousMatch[] = []
  const unmatchedFiles: string[] = []

  for (const filename of filenames) {
    // --- Priority A: Member-ID matching ---
    const parsed = parsePhase2Filename(filename)
    if (parsed && memberIdSet.has(parsed.memberId)) {
      const existing = memberFileMap.get(parsed.memberId)
      if (existing) {
        existing.push(filename)
      } else {
        memberFileMap.set(parsed.memberId, [filename])
      }
      matchedFiles.set(filename, {
        filename,
        memberId: parsed.memberId,
        method: 'member-id',
      })
      continue
    }

    // Safety: If the filename follows the Phase 2 convention
    // (Name__MemberId.ext) but the extracted member ID is NOT in this
    // class, treat the file as unmatched. Do NOT fall through to name
    // matching, which would risk silently reassigning a photo that was
    // explicitly uploaded for a member in a different class.
    if (parsed) {
      unmatchedFiles.push(filename)
      continue
    }

    // --- Priority B: Name matching ---
    if (nameColumnKey) {
      const baseName = stripExtension(filename)
      const normalizedFilename = normalizeName(baseName)
      if (!normalizedFilename) {
        unmatchedFiles.push(filename)
        continue
      }

      const candidateIds = nameToMemberIds.get(normalizedFilename)
      if (!candidateIds || candidateIds.length === 0) {
        unmatchedFiles.push(filename)
        continue
      }

      if (candidateIds.length > 1) {
        // Ambiguous: multiple members share this name
        ambiguousFromNames.push({
          filename,
          candidateMemberIds: [...candidateIds],
          reason: 'duplicate-names',
        })
        continue
      }

      // Single candidate
      const memberId = candidateIds[0]
      const existing = memberFileMap.get(memberId)
      if (existing) {
        existing.push(filename)
      } else {
        memberFileMap.set(memberId, [filename])
      }
      matchedFiles.set(filename, {
        filename,
        memberId,
        method: 'name-match',
      })
      continue
    }

    // No name column configured and no ID match
    unmatchedFiles.push(filename)
  }

  // --- Post-processing: detect duplicate files for the same member ---
  const duplicateFiles: Array<{ memberId: string; filenames: string[] }> = []
  const finalMatches: PhotoMatch[] = []
  const ambiguousFromDuplicates: AmbiguousMatch[] = []

  for (const [memberId, fileList] of memberFileMap) {
    if (fileList.length === 1) {
      // Clean single match
      const match = matchedFiles.get(fileList[0])
      if (match) finalMatches.push(match)
    } else {
      // Multiple files for the same member — ambiguous
      duplicateFiles.push({ memberId, filenames: [...fileList] })
      ambiguousFromDuplicates.push({
        filename: fileList.join(', '),
        candidateMemberIds: [memberId],
        reason: 'multiple-files-for-member',
      })
    }
  }

  // --- Missing members: those with no match at all ---
  const matchedMemberIds = new Set([
    ...finalMatches.map((m) => m.memberId),
    ...ambiguousFromDuplicates.flatMap((a) => a.candidateMemberIds),
    ...ambiguousFromNames.flatMap((a) => a.candidateMemberIds),
  ])

  const missingMembers: Array<{ memberId: string; memberName: string }> = []
  for (const m of members) {
    if (!matchedMemberIds.has(m.id)) {
      const name = nameColumnKey
        ? m.customFields?.[nameColumnKey] ?? ''
        : `${m.firstName} ${m.lastName}`.trim()
      missingMembers.push({ memberId: m.id, memberName: name || '(unnamed)' })
    }
  }

  return {
    matches: finalMatches,
    ambiguous: [...ambiguousFromNames, ...ambiguousFromDuplicates],
    missingMembers,
    unmatchedFiles,
    duplicateFiles,
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse a Phase 2 filename: `<SanitizedName>__<MemberId>.<ext>`
 * The member ID is after the LAST double-underscore separator.
 */
function parsePhase2Filename(
  filename: string,
): { name: string; memberId: string } | null {
  const base = stripExtension(filename)
  const separatorIndex = base.lastIndexOf('__')
  if (separatorIndex < 0) return null

  const name = base.slice(0, separatorIndex)
  const memberId = base.slice(separatorIndex + 2)

  if (!memberId || !name) return null
  return { name, memberId }
}

/** Remove the file extension from a filename. */
function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  if (dot <= 0) return filename
  return filename.slice(0, dot)
}

/**
 * Normalize a name for comparison:
 * - Lowercase
 * - Trim leading/trailing whitespace
 * - Collapse all internal whitespace sequences to a single space
 * - Remove common sanitization artifacts (characters removed by Phase 2 sanitizeName)
 */
function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[\s]+/g, ' ')
    .replace(/[/\\:*?"<>|]/g, '') // Characters stripped by Phase 2 sanitizeName
}

// ---------------------------------------------------------------------------
// Drive metadata matching for legacy parent-uploaded photos
// ---------------------------------------------------------------------------

/**
 * Extract a Drive file ID from a member's image URL.
 *
 * Supports the proxy format: `/api/drive/download/<fileId>`
 * Returns null if the URL doesn't match this pattern.
 */
export function extractDriveFileId(imageUrl: string): string | null {
  if (!imageUrl) return null
  const prefix = '/api/drive/download/'
  const idx = imageUrl.indexOf(prefix)
  if (idx < 0) return null
  const fileId = imageUrl.slice(idx + prefix.length).split('/')[0]?.split('?')[0]
  return fileId || null
}

/**
 * Fetch the Drive filename for a given file ID via the metadata API.
 * Returns the filename or null if the lookup fails.
 *
 * This is a read-only operation — no file bytes are downloaded.
 */
export async function fetchDriveFilename(fileId: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/drive/metadata/${encodeURIComponent(fileId)}`)
    if (!res.ok) return null
    const data = await res.json() as { name?: string }
    return data.name || null
  } catch {
    return null
  }
}

/**
 * Result of a Drive-metadata-based legacy match attempt.
 */
export interface DriveMetadataMatch {
  /** The member's Firestore document ID */
  memberId: string
  /** The image URL field name (e.g. 'profileImage') */
  fieldName: string
  /** The Drive filename retrieved from metadata */
  driveFilename: string
  /** The matching local filename */
  localFilename: string
}

export interface DriveMetadataMatchResult {
  /** Unambiguous Drive-filename matches */
  matches: DriveMetadataMatch[]
  /** Members whose Drive file could not be looked up */
  lookupFailed: Array<{ memberId: string; memberName: string; reason: string }>
  /** Members whose Drive filename doesn't match any local file */
  noLocalMatch: Array<{ memberId: string; memberName: string; driveFilename: string }>
}

/**
 * Match legacy parent-uploaded photos by fetching Drive file metadata
 * and comparing the filename to local directory contents.
 *
 * Only processes members who:
 * 1. Were NOT already matched by ID or name
 * 2. Have a Drive image URL for the given field
 * 3. Have a URL that doesn't use the Phase 2 filename convention
 *
 * Does NOT download file bytes — only reads metadata (filename).
 * Does NOT modify any Drive files or member records.
 *
 * @param unmatchedMemberIds  Member IDs that have no match from Priority A/B
 * @param members             All members in the class
 * @param fieldName           The image column name (e.g. 'profileImage')
 * @param localFilenames      Array of filenames in the local directory
 * @param alreadyMatchedLocalFiles  Set of local filenames already matched
 * @param nameColumnKey       The table's configured Name column key
 */
export async function matchLegacyByDriveMetadata(
  unmatchedMemberIds: string[],
  members: Member[],
  fieldName: string,
  localFilenames: string[],
  alreadyMatchedLocalFiles: Set<string>,
  nameColumnKey: string | undefined,
): Promise<DriveMetadataMatchResult> {
  const matches: DriveMetadataMatch[] = []
  const lookupFailed: DriveMetadataMatchResult['lookupFailed'] = []
  const noLocalMatch: DriveMetadataMatchResult['noLocalMatch'] = []

  const memberById = new Map(members.map((m) => [m.id, m]))

  // Build a lookup of normalized local filenames → original filenames
  const availableLocalFiles = localFilenames.filter(
    (f) => !alreadyMatchedLocalFiles.has(f),
  )
  const localByNormalized = new Map<string, string>()
  for (const f of availableLocalFiles) {
    localByNormalized.set(f.toLowerCase(), f)
  }

  for (const memberId of unmatchedMemberIds) {
    const member = memberById.get(memberId)
    if (!member) continue

    const memberName = nameColumnKey
      ? member.customFields?.[nameColumnKey] ?? `${member.firstName} ${member.lastName}`.trim()
      : `${member.firstName} ${member.lastName}`.trim()

    // Get the member's image URL for this field
    let imageUrl = ''
    switch (fieldName) {
      case 'profileImage': imageUrl = member.profileImage ?? ''; break
      case 'signature': imageUrl = member.signature ?? ''; break
      case 'divisionLogo': imageUrl = member.divisionLogo ?? ''; break
      case 'fingerprint': imageUrl = member.fingerprint ?? ''; break
      default: imageUrl = member.customFields?.[fieldName] ?? ''; break
    }

    if (!imageUrl) continue

    // Skip if this is already a Phase 2 URL (those are handled by ID matching)
    const fileId = extractDriveFileId(imageUrl)
    if (!fileId) continue

    // Fetch the Drive filename
    const driveFilename = await fetchDriveFilename(fileId)
    if (!driveFilename) {
      lookupFailed.push({
        memberId,
        memberName: memberName || '(unnamed)',
        reason: 'Could not retrieve file metadata from Google Drive',
      })
      continue
    }

    // Try to find this exact filename in the local directory (case-insensitive)
    const localMatch = localByNormalized.get(driveFilename.toLowerCase())
    if (localMatch) {
      matches.push({
        memberId,
        fieldName,
        driveFilename,
        localFilename: localMatch,
      })
      // Remove from available pool to prevent double-matching
      localByNormalized.delete(driveFilename.toLowerCase())
    } else {
      noLocalMatch.push({
        memberId,
        memberName: memberName || '(unnamed)',
        driveFilename,
      })
    }
  }

  return { matches, lookupFailed, noLocalMatch }
}


