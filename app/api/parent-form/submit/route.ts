/**
 * POST /api/parent-form/submit
 *
 * Public endpoint (no auth). Validates the share token, then creates
 * a member document in the linked subfolder via Admin Firestore.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { Readable } from 'stream'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { COLLECTIONS } from '@/lib/models/types'
import {
  getAuthenticatedDriveClient,
  getOrCreateWorkspaceFolder,
  findOrCreateFolder,
} from '@/lib/firebase/drive-credentials'

// Known image fields that map to top-level member properties
const KNOWN_IMAGE_FIELDS = new Set(['profileImage', 'signature', 'fingerprint', 'divisionLogo'])

/**
 * Upload a base64 data-URL image to Google Drive and return the
 * proxy download URL (`/api/drive/download/{fileId}`).
 *
 * Drive path: CardForge/{collegeName}/{subfolderName}/{fieldName}/{file}
 */
async function uploadBase64ToDrive(
  dataUrl: string,
  fieldName: string,
  workspaceId: string,
  collegeName?: string,
  subfolderName?: string,
): Promise<string> {
  // Parse data URL: "data:<mime>;base64,<payload>"
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return ''

  const mimeType = match[1]
  const buffer = Buffer.from(match[2], 'base64')

  const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'bin'
  const safeName = `${Date.now()}_${fieldName.replace(/[^a-zA-Z0-9._-]/g, '_')}.${ext}`

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

    // 2. Get next row number for this subfolder
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

    // 3. Upload images to Google Drive and collect URLs
    const imageUrls: Record<string, string> = {}
    if (imageData) {
      for (const [col, dataUrl] of Object.entries(imageData)) {
        if (dataUrl) {
          try {
            imageUrls[col] = await uploadBase64ToDrive(dataUrl, col, workspaceId, collegeName, subfolderName)
          } catch (err) {
            console.error(`[parent-form/submit] Image upload failed for "${col}":`, err)
            // Continue — don't fail the whole submission for one image
          }
        }
      }
    }

    // 4. Build member document
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

    const docRef = await membersRef.add(memberData)

    return NextResponse.json({
      success: true,
      memberId: docRef.id,
    })
  } catch (error) {
    console.error('[parent-form/submit] Error:', error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
