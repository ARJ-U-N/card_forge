/**
 * GET /api/drive/metadata/[fileId]
 *
 * Returns read-only file metadata (name, mimeType) for a Google Drive file
 * WITHOUT downloading the file bytes.
 *
 * Used by the local-photo matcher to associate legacy timestamp-named
 * parent-uploaded photos with their corresponding local files.
 *
 * This endpoint requires the owner's Drive authorization (same as
 * the download endpoint).
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  getAuthenticatedDriveClient,
  DriveNotConnectedError,
} from '@/lib/firebase/drive-credentials'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  try {
    const { fileId } = await params

    if (!fileId) {
      return NextResponse.json({ error: 'Missing fileId' }, { status: 400 })
    }

    const { drive } = await getAuthenticatedDriveClient()

    // Fetch only metadata — no file bytes downloaded
    const meta = await drive.files.get({
      fileId,
      fields: 'id,name,mimeType',
    })

    return NextResponse.json({
      id: meta.data.id,
      name: meta.data.name,
      mimeType: meta.data.mimeType,
    })
  } catch (error) {
    if (error instanceof DriveNotConnectedError) {
      return NextResponse.json(
        { error: error.message, code: 'DRIVE_AUTH_REQUIRED' },
        { status: 401 },
      )
    }

    // Google API 404
    const gError = error as { code?: number }
    if (gError.code === 404) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    console.error('[drive/metadata]', error)
    return NextResponse.json(
      { error: 'Metadata lookup failed' },
      { status: 500 },
    )
  }
}

