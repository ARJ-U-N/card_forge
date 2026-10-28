/**
 * GET /api/drive/auth/connect
 *
 * Redirects the print shop owner to Google's OAuth consent screen.
 * Only the owner should visit this URL (it's a one-time setup).
 *
 * Includes a random `state` parameter for CSRF protection.
 * The callback route validates this state before exchanging codes.
 */
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createOAuth2Client } from '@/lib/firebase/drive-credentials'
import { getAdminFirestore } from '@/lib/firebase/admin'

export async function GET() {
  try {
    const oauth2 = createOAuth2Client()

    // Generate a random state token for CSRF protection
    const state = randomBytes(32).toString('hex')

    // Store the state temporarily in Firestore (expires in 10 minutes)
    const db = getAdminFirestore()
    await db.doc('system/driveOAuthState').set({
      state,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10 * 60 * 1000,
    })

    const authUrl = oauth2.generateAuthUrl({
      access_type: 'offline',
      prompt: 'select_account consent',
      scope: ['https://www.googleapis.com/auth/drive.file'],
      state,
    })

    return NextResponse.redirect(authUrl)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to initiate OAuth' },
      { status: 500 },
    )
  }
}
