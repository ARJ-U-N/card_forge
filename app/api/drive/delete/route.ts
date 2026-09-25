/**
 * POST /api/drive/delete
 *
 * Deletes a file from Google Drive.
 *
 * Expects JSON body: { fileId: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  getAuthenticatedDriveClient,
  DriveNotConnectedError,
} from '@/lib/firebase/drive-credentials'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { fileId } = body as { fileId?: string }

    if (!fileId) {
      return NextResponse.json({ error: 'Missing fileId' }, { status: 400 })
    }

    const { drive } = await getAuthenticatedDriveClient()

    await drive.files.delete({ fileId })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof DriveNotConnectedError) {
      return NextResponse.json(
        { error: error.message, code: 'DRIVE_AUTH_REQUIRED' },
        { status: 401 },
      )
    }

    // If file already doesn't exist, that's fine
    const gError = error as { code?: number }
    if (gError.code === 404) {
      return NextResponse.json({ success: true })
    }

    console.error('[drive/delete]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Delete failed' },
      { status: 500 },
    )
  }
}
