/**
 * GET /api/drive/auth/status
 *
 * Returns whether Google Drive is connected and functional.
 *
 * Performs a lightweight validation by attempting to refresh the token
 * (if expired) and making a minimal Drive API call (about.get) to
 * confirm the credentials are actually usable — not just present.
 *
 * Response shape:
 *   { connected: boolean, email?: string, error?: string }
 *
 * Never exposes tokens, secrets, or other sensitive data.
 */
import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import {
  getDriveCredentials,
  createOAuth2Client,
  saveDriveCredentials,
} from '@/lib/firebase/drive-credentials'

export async function GET() {
  try {
    const creds = await getDriveCredentials()

    if (!creds || !creds.refreshToken) {
      return NextResponse.json({
        connected: false,
        reason: 'no-credentials',
      })
    }

    // Build an OAuth2 client and attempt a lightweight Drive call
    // to verify the credentials are actually usable.
    const oauth2 = createOAuth2Client()
    oauth2.setCredentials({
      access_token: creds.accessToken,
      refresh_token: creds.refreshToken,
      expiry_date: creds.expiresAt,
    })

    // Refresh the access token if expired
    if (Date.now() > creds.expiresAt - 60_000) {
      try {
        const { credentials } = await oauth2.refreshAccessToken()
        oauth2.setCredentials(credentials)

        // Persist refreshed tokens
        await saveDriveCredentials({
          accessToken: credentials.access_token ?? creds.accessToken,
          refreshToken: credentials.refresh_token ?? creds.refreshToken,
          expiresAt: credentials.expiry_date ?? Date.now() + 3600_000,
          rootFolderId: creds.rootFolderId,
          updatedAt: new Date().toISOString(),
        })
      } catch {
        return NextResponse.json({
          connected: false,
          reason: 'token-expired',
        })
      }
    }

    // Make a minimal Drive API call to confirm the token works
    const drive = google.drive({ version: 'v3', auth: oauth2 })
    const about = await drive.about.get({ fields: 'user(emailAddress)' })
    const email = about.data.user?.emailAddress ?? undefined

    return NextResponse.json({
      connected: true,
      email,
    })
  } catch (err) {
    console.error('[drive/auth/status] Validation failed:', err)
    return NextResponse.json({
      connected: false,
      reason: 'validation-failed',
    })
  }
}
