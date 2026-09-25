/**
 * GET /api/drive/auth/status
 *
 * Returns whether Google Drive is connected and functional.
 */
import { NextResponse } from 'next/server'
import { getDriveCredentials } from '@/lib/firebase/drive-credentials'

export async function GET() {
  try {
    const creds = await getDriveCredentials()

    if (!creds || !creds.refreshToken) {
      return NextResponse.json({
        connected: false,
        rootFolderId: null,
      })
    }

    return NextResponse.json({
      connected: true,
      rootFolderId: creds.rootFolderId,
      expiresAt: creds.expiresAt,
    })
  } catch {
    return NextResponse.json({
      connected: false,
      rootFolderId: null,
    })
  }
}
