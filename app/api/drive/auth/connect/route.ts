/**
 * GET /api/drive/auth/connect
 *
 * Redirects the print shop owner to Google's OAuth consent screen.
 * Only the owner should visit this URL (it's a one-time setup).
 */
import { NextResponse } from 'next/server'
import { createOAuth2Client } from '@/lib/firebase/drive-credentials'

export async function GET() {
  try {
    const oauth2 = createOAuth2Client()

    const authUrl = oauth2.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/drive.file'],
    })

    return NextResponse.redirect(authUrl)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to initiate OAuth' },
      { status: 500 },
    )
  }
}
