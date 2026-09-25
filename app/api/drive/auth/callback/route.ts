/**
 * GET /api/drive/auth/callback
 *
 * Google redirects here after the owner grants consent.
 * Exchanges the authorization code for tokens and stores them.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createOAuth2Client, saveDriveCredentials } from '@/lib/firebase/drive-credentials'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const error = request.nextUrl.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(
      new URL(`/dashboard?drive_error=${encodeURIComponent(error)}`, request.url),
    )
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/dashboard?drive_error=no_code', request.url),
    )
  }

  try {
    const oauth2 = createOAuth2Client()
    const { tokens } = await oauth2.getToken(code)

    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        new URL('/dashboard?drive_error=no_refresh_token', request.url),
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
      new URL('/dashboard?drive_connected=true', request.url),
    )
  } catch (err) {
    console.error('[drive/auth/callback]', err)
    return NextResponse.redirect(
      new URL(`/dashboard?drive_error=${encodeURIComponent(String(err))}`, request.url),
    )
  }
}
