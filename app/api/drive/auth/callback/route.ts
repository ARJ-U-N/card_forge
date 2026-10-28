/**
 * GET /api/drive/auth/callback
 *
 * Google redirects here after the owner grants consent.
 * Validates the OAuth state parameter, exchanges the authorization code
 * for tokens, and stores them. Redirects to /workspace with status params.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createOAuth2Client, saveDriveCredentials } from '@/lib/firebase/drive-credentials'
import { getAdminFirestore } from '@/lib/firebase/admin'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const error = request.nextUrl.searchParams.get('error')
  const state = request.nextUrl.searchParams.get('state')

  if (error) {
    return NextResponse.redirect(
      new URL(`/workspace?drive_error=${encodeURIComponent(error)}`, request.url),
    )
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/workspace?drive_error=no_code', request.url),
    )
  }

  // Validate OAuth state parameter for CSRF protection
  if (!state) {
    return NextResponse.redirect(
      new URL('/workspace?drive_error=missing_state', request.url),
    )
  }

  try {
    const db = getAdminFirestore()
    const stateDoc = await db.doc('system/driveOAuthState').get()
    const stateData = stateDoc.data()

    if (!stateData || stateData.state !== state) {
      return NextResponse.redirect(
        new URL('/workspace?drive_error=invalid_state', request.url),
      )
    }

    // Check expiry (10-minute window)
    if (Date.now() > stateData.expiresAt) {
      return NextResponse.redirect(
        new URL('/workspace?drive_error=state_expired', request.url),
      )
    }

    // Clean up the used state token
    await db.doc('system/driveOAuthState').delete()
  } catch (stateErr) {
    console.error('[drive/auth/callback] State validation error:', stateErr)
    return NextResponse.redirect(
      new URL('/workspace?drive_error=state_validation_failed', request.url),
    )
  }

  try {
    const oauth2 = createOAuth2Client()
    const { tokens } = await oauth2.getToken(code)

    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        new URL('/workspace?drive_error=no_refresh_token', request.url),
      )
    }

    await saveDriveCredentials({
      accessToken: tokens.access_token ?? '',
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expiry_date ?? Date.now() + 3600_000,
      rootFolderId: null,
      updatedAt: new Date().toISOString(),
    })

    return NextResponse.redirect(
      new URL('/workspace?drive_connected=true', request.url),
    )
  } catch (err) {
    console.error('[drive/auth/callback]', err)
    return NextResponse.redirect(
      new URL(`/workspace?drive_error=${encodeURIComponent(String(err))}`, request.url),
    )
  }
}
