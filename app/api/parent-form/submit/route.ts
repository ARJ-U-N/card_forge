/**
 * POST /api/parent-form/submit
 *
 * Public endpoint (no auth). Validates the share token, then creates
 * a member document in the linked subfolder via Admin Firestore.
 *
 * Image filenames use the value from the column marked as the table's
 * Name column, combined with the reserved Firestore member document ID:
 *   <SanitizedName>__<MemberId>.<ext>
 */

import { NextResponse, type NextRequest } from 'next/server'
import { Readable } from 'stream'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { COLLECTIONS, getTableNameColumn } from '@/lib/models/types'
import {
  getAuthenticatedDriveClient,
  getOrCreateWorkspaceFolder,
  findOrCreateFolder,
} from '@/lib/firebase/drive-credentials'

// Known image fields that map to top-level member properties
const KNOWN_IMAGE_FIELDS = new Set(['profileImage', 'signature', 'fingerprint', 'divisionLogo'])

// ---------------------------------------------------------------------------
// Filename helpers
// ---------------------------------------------------------------------------

/** Maximum length for the sanitized name portion of the filename. */
const MAX_NAME_LENGTH = 100

/**
 * Sanitize a member name for use as a Drive filename component.
 *
 * - Trims leading/trailing whitespace.
 * - Normalizes runs of whitespace to single spaces.
 * - Removes filesystem-unsafe characters and control characters.
 * - Preserves Unicode letters (e.g. Indian scripts).
 * - Truncates to MAX_NAME_LENGTH to prevent excessively long names.
 * - Falls back to "Unnamed" when the result would be empty.
 */
function sanitizeName(raw: string): string {
  let name = raw
    .trim()
    .replace(/\s+/g, ' ')
    // Remove characters that are invalid or problematic in filenames
    // across Windows, macOS, and Linux: / \ : * ? " < > | and control chars.
    // Preserve Unicode letters, digits, spaces, hyphens, periods, parentheses,
    // commas, and underscores.
    .replace(/[/\\:*?"<>|\x00-\x1f]/g, '')
    .trim()

  if (name.length > MAX_NAME_LENGTH) {
    name = name.slice(0, MAX_NAME_LENGTH).trim()
  }

  return name || 'Unnamed'
}

/**
 * Build the Drive filename for a parent-uploaded image.
 *
 *   <SanitizedName>__<MemberId>.<ext>
 *
 * The double-underscore separator is chosen because it is unlikely to appear
 * in a student's name and clearly separates the human-readable portion from
 * the machine-readable member ID.
 */
function buildImageFilename(
  memberName: string,
  memberId: string,
  mimeType: string,
): string {
  const sanitized = sanitizeName(memberName)
  const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'bin'
  return `${sanitized}__${memberId}.${ext}`
}

// ---------------------------------------------------------------------------
// Drive upload
// ---------------------------------------------------------------------------

/**
 * Upload a base64 data-URL image to Google Drive and return the
 * proxy download URL (`/api/drive/download/{fileId}`).
 *
 * Drive path: CardForge/{collegeName}/{subfolderName}/{fieldName}/{file}
 *
 * @param memberName  Value from the table's configured Name column
 * @param memberId    Reserved Firestore member document ID
 */
async function uploadBase64ToDrive(
  dataUrl: string,
  fieldName: string,
  workspaceId: string,
  memberName: string,
  memberId: string,
  collegeName?: string,
  subfolderName?: string,
): Promise<string> {
  // Parse data URL: "data:<mime>;base64,<payload>"
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return ''

  const mimeType = match[1]
  const buffer = Buffer.from(match[2], 'base64')

  const safeName = buildImageFilename(memberName, memberId, mimeType)

  const { drive } = await getAuthenticatedDriveClient()

  // Build folder: CardForge/{collegeName}/{subfolderName}/{fieldName}
  let parentFolderId = await getOrCreateWorkspaceFolder(workspaceId, collegeName)
  if (subfolderName) {
    parentFolderId = await findOrCreateFolder(subfolderName, parentFolderId)
  }
  parentFolderId = await findOrCreateFolder(fieldName, parentFolderId)

  const uploadRes = await drive.files.create({
    requestBody: {
      name: safeName,
      parents: [parentFolderId],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: 'id',
  })

  const driveFileId = uploadRes.data.id!
  return `/api/drive/download/${driveFileId}`
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { shareToken, values, imageData } = body as {
      shareToken?: string
      values?: Record<string, string>
      imageData?: Record<string, string>
    }

    if (!shareToken) {
      return NextResponse.json({ error: 'shareToken is required.' }, { status: 400 })
    }

    const db = getAdminFirestore()

    // 1. Re-validate token
    const shareSnap = await db
      .collection(COLLECTIONS.parentShares)
      .where('shareToken', '==', shareToken)
      .limit(1)
      .get()

    if (shareSnap.empty) {
      return NextResponse.json({ error: 'Invalid share link.' }, { status: 404 })
    }

    const share = shareSnap.docs[0].data()

    if (!share.enabled) {
      return NextResponse.json({ error: 'This share link has been disabled.' }, { status: 403 })
    }

    const workspaceId = share.workspaceId as string
    const folderId = share.folderId as string
    const subfolderId = share.subfolderId as string
    const collegeName = (share.folderName as string) || undefined
    const subfolderName = (share.subfolderName as string) || undefined

    // 2. Load the College folder's table schema to find the Name column.
    //    The table definition (tableColumns, tableColumnTypes, tableColumnRoles)
    //    lives on the root College folder; subfolders inherit it.
    const folderSnap = await db
      .collection(COLLECTIONS.workspaces)
      .doc(workspaceId)
      .collection(COLLECTIONS.folders)
      .doc(folderId)
      .get()

    let memberName = ''
    if (folderSnap.exists) {
      const folderData = folderSnap.data()!
      const tableColumnRoles: Record<string, { isTableName?: boolean }> =
        folderData.tableColumnRoles && typeof folderData.tableColumnRoles === 'object'
          ? folderData.tableColumnRoles
          : {}

      const nameColumn = getTableNameColumn(tableColumnRoles)
      if (nameColumn && values?.[nameColumn]) {
        memberName = values[nameColumn]
      }
    }

    // 3. Get next row number for this subfolder
    const membersRef = db
      .collection(COLLECTIONS.workspaces)
      .doc(workspaceId)
      .collection(COLLECTIONS.members)

    const rowSnap = await membersRef
      .where('folderId', '==', folderId)
      .where('subfolderId', '==', subfolderId)
      .orderBy('rowNumber', 'desc')
      .limit(1)
      .get()

    let nextRow = 1
    if (!rowSnap.empty) {
      const maxRow = rowSnap.docs[0].data().rowNumber
      nextRow = (typeof maxRow === 'number' ? maxRow : 0) + 1
    }

    // 4. Reserve a member document reference to obtain its ID before
    //    uploading images. This does NOT write to Firestore — it only
    //    generates a unique document ID that will be used later.
    const reservedRef = membersRef.doc()
    const memberId = reservedRef.id

    // 5. Upload images to Google Drive using the name-based filename.
    //    All images for this member share the same memberId in their
    //    filename but are placed in separate image-column folders.
    const imageUrls: Record<string, string> = {}
    if (imageData) {
      for (const [col, dataUrl] of Object.entries(imageData)) {
        if (dataUrl) {
          try {
            imageUrls[col] = await uploadBase64ToDrive(
              dataUrl,
              col,
              workspaceId,
              memberName,
              memberId,
              collegeName,
              subfolderName,
            )
          } catch (err) {
            console.error(`[parent-form/submit] Image upload failed for "${col}":`, err)
            // Continue — don't fail the whole submission for one image
          }
        }
      }
    }

    // 6. Build member document
    // Image URLs go into both:
    //   - known top-level fields (profileImage, signature, etc.) for the designer/edit dialog
    //   - customFields[col] so the dynamic-column member table can render them
    const customFields: Record<string, string> = { ...(values ?? {}) }
    for (const [col, url] of Object.entries(imageUrls)) {
      customFields[col] = url
    }

    const memberData: Record<string, unknown> = {
      workspaceId,
      folderId,
      subfolderId,
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      title: '',
      gender: '',
      employeeId: '',
      idNumber: '',
      department: '',
      hireDate: '',
      expireDate: '',
      parentPhone: '',
      branch: '',
      roomId: '',
      profileImage: imageUrls.profileImage ?? '',
      signature: imageUrls.signature ?? '',
      fingerprint: imageUrls.fingerprint ?? '',
      divisionLogo: imageUrls.divisionLogo ?? '',
      rowNumber: nextRow,
      customFields,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }

    // 7. Write the member document using the reserved reference so its
    //    document ID matches the ID embedded in the image filenames.
    await reservedRef.set(memberData)

    return NextResponse.json({
      success: true,
      memberId,
    })
  } catch (error) {
    console.error('[parent-form/submit] Error:', error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
