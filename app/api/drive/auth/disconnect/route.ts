/**
 * POST /api/drive/auth/disconnect
 *
 * Disconnects Google Drive by clearing stored credentials and
 * optionally revoking the Google OAuth token.
 *
 * Requires a valid Firebase ID token in the Authorization header
 * and verifies the caller is the workspace owner.
 *
 * Never deletes files or folders from Google Drive.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { getDriveCredentials } from '@/lib/firebase/drive-credentials'
import { COLLECTIONS } from '@/lib/models/types'

export async function POST(request: NextRequest) {
  // 1. Verify Firebase ID token from Authorization header
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Authentication required.' },
      { status: 401 },
    )
  }

  const idToken = authHeader.slice(7)
  let uid: string

  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(idToken)
    uid = decoded.uid
  } catch {
    return NextResponse.json(
      { error: 'Invalid or expired authentication token.' },
      { status: 401 },
    )
  }

  // 2. Verify the caller is the workspace owner
  try {
    const db = getAdminFirestore()
    const userSnap = await db.collection(COLLECTIONS.users).doc(uid).get()
    const userData = userSnap.data()

    if (!userData || userData.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only the workspace owner can disconnect Google Drive.' },
        { status: 403 },
      )
    }
  } catch {
    return NextResponse.json(
      { error: 'Failed to verify user permissions.' },
      { status: 500 },
    )
  }

  // 3. Read current credentials for token revocation
  let tokenRevoked = false
  let revocationError: string | undefined

  try {
    const creds = await getDriveCredentials()

    if (creds?.accessToken) {
      // Attempt to revoke the token at Google's endpoint.
      // This is best-effort — the credential is cleared regardless.
      try {
        const revokeRes = await fetch(
          `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(creds.accessToken)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          },
        )
        tokenRevoked = revokeRes.ok
        if (!revokeRes.ok) {
          revocationError = `Google returned ${revokeRes.status}`
        }
      } catch (err) {
        revocationError = err instanceof Error ? err.message : 'Network error during revocation'
      }
    }
  } catch {
    // If we can't read credentials, we still proceed with deletion
  }

  // 4. Delete the credentials document from Firestore
  try {
    const db = getAdminFirestore()
    await db.doc('system/driveCredentials').delete()
  } catch (err) {
    console.error('[drive/auth/disconnect] Failed to delete credentials:', err)
    return NextResponse.json(
      { error: 'Failed to remove stored credentials.' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    success: true,
    tokenRevoked,
    revocationError,
  })
}

