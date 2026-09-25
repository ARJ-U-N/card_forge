/**
 * GET /api/drive/download/[fileId]
 *
 * Streams a file from Google Drive to the browser.
 * This is same-origin so there are no CORS issues for canvas/img.
 *
 * Sets appropriate caching headers so the browser caches files
 * during bulk rendering (1000+ students).
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

    // Get file metadata for content type
    const meta = await drive.files.get({
      fileId,
      fields: 'id,name,mimeType,size',
    })

    const mimeType = meta.data.mimeType ?? 'application/octet-stream'

    // Download file content
    const response = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' },
    )

    const buffer = Buffer.from(response.data as ArrayBuffer)

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, max-age=3600, stale-while-revalidate=86400',
        'X-Content-Type-Options': 'nosniff',
      },
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

    console.error('[drive/download]', error)
    return NextResponse.json(
      { error: 'Download failed' },
      { status: 500 },
    )
  }
}
