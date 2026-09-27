/**
 * POST /api/drive/upload
 *
 * Uploads a file to the owner's Google Drive under:
 *   CardForge/{collegeName}/{path segments}/{timestamp}_{filename}
 *
 * Path segments typically represent: {subfolderName}/{imageColumnName}
 *
 * Expects multipart form data with:
 *   - file: the file to upload
 *   - workspaceId: workspace ID (internal identity)
 *   - path: logical path (e.g. "BCA/profileImage")
 *   - collegeName: optional human-readable name for the College Drive folder
 */
import { NextRequest, NextResponse } from 'next/server'
import { Readable } from 'stream'
import {
  getAuthenticatedDriveClient,
  getOrCreateWorkspaceFolder,
  findOrCreateFolder,
  DriveNotConnectedError,
} from '@/lib/firebase/drive-credentials'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const workspaceId = formData.get('workspaceId') as string | null
    const path = formData.get('path') as string | null
    const collegeName = formData.get('collegeName') as string | null

    if (!file || !workspaceId) {
      return NextResponse.json(
        { error: 'Missing required fields: file, workspaceId' },
        { status: 400 },
      )
    }

    const { drive } = await getAuthenticatedDriveClient()

    // Build folder hierarchy: CardForge/{collegeName}/{path segments}
    let parentFolderId = await getOrCreateWorkspaceFolder(workspaceId, collegeName || undefined)

    // Create subfolders from path (e.g. "BCA/profileImage" → BCA → profileImage)
    if (path) {
      const segments = path.split('/').filter(Boolean)
      for (const segment of segments) {
        parentFolderId = await findOrCreateFolder(segment, parentFolderId)
      }
    }

    // Upload file
    const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const uploadRes = await drive.files.create({
      requestBody: {
        name: safeName,
        parents: [parentFolderId],
      },
      media: {
        mimeType: file.type || 'application/octet-stream',
        body: Readable.from(buffer),
      },
      fields: 'id,name,mimeType',
    })

    const driveFileId = uploadRes.data.id!

    return NextResponse.json({
      fileId: driveFileId,
      url: `/api/drive/download/${driveFileId}`,
      mimeType: uploadRes.data.mimeType ?? file.type,
      filename: file.name,
    })
  } catch (error) {
    if (error instanceof DriveNotConnectedError) {
      return NextResponse.json(
        { error: error.message, code: 'DRIVE_AUTH_REQUIRED' },
        { status: 401 },
      )
    }
    console.error('[drive/upload]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 },
    )
  }
}
