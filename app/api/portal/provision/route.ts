/**
 * POST /api/portal/provision
 *
 * Server-side endpoint that provisions a portal user in Firebase Auth.
 *
 * 1. Looks up the portal by token (Admin Firestore)
 * 2. Verifies the portal is enabled
 * 3. Verifies the email matches portal.collaboratorEmail
 * 4. Creates or retrieves a Firebase Auth user for this email
 * 5. Creates or updates the Firestore user doc (role: 'portal')
 * 6. Adds the user to workspace memberIds if not already present
 * 7. Returns a custom token for client-side signInWithCustomToken
 */

import { NextResponse, type NextRequest } from 'next/server'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue } from 'firebase-admin/firestore'
import { COLLECTIONS } from '@/lib/models/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { portalToken, email } = body as {
      portalToken?: string
      email?: string
    }

    if (!portalToken || !email) {
      return NextResponse.json(
        { error: 'portalToken and email are required.' },
        { status: 400 },
      )
    }

    const normalizedEmail = email.trim().toLowerCase()

    // 1. Look up portal by token
    const db = getAdminFirestore()
    const portalSnap = await db
      .collection(COLLECTIONS.portals)
      .where('portalToken', '==', portalToken)
      .limit(1)
      .get()

    if (portalSnap.empty) {
      return NextResponse.json(
        { error: 'Invalid portal link.' },
        { status: 404 },
      )
    }

    const portalDoc = portalSnap.docs[0]
    const portal = portalDoc.data()

    // 2. Check portal is enabled
    if (!portal.enabled) {
      return NextResponse.json(
        { error: 'This portal is currently disabled.' },
        { status: 403 },
      )
    }

    // 3. Verify email matches
    const registeredEmail = (portal.collaboratorEmail ?? '').trim().toLowerCase()
    if (!registeredEmail) {
      return NextResponse.json(
        { error: 'No collaborator email configured for this portal.' },
        { status: 403 },
      )
    }

    if (normalizedEmail !== registeredEmail) {
      return NextResponse.json(
        { error: 'This email is not authorized for this portal.' },
        { status: 403 },
      )
    }

    const workspaceId = portal.workspaceId as string
    const folderId = portal.folderId as string
    const folderName = portal.folderName as string

    // 4. Create or retrieve Firebase Auth user
    const adminAuth = getAuth(getAdminApp())
    let uid: string

    try {
      const existingUser = await adminAuth.getUserByEmail(normalizedEmail)
      uid = existingUser.uid
    } catch {
      // User doesn't exist, create one
      const newUser = await adminAuth.createUser({
        email: normalizedEmail,
        displayName: `${folderName} Admin`,
      })
      uid = newUser.uid
    }

    // 5. Create or update Firestore user doc
    const userRef = db.collection(COLLECTIONS.users).doc(uid)
    const userSnap = await userRef.get()

    if (!userSnap.exists) {
      await userRef.set({
        email: normalizedEmail,
        authUid: uid,
        workspaceId,
        role: 'portal',
        portalFolderId: folderId,
        profile: {
          displayName: `${folderName} Admin`,
          photoURL: null,
          jobTitle: null,
          phone: null,
        },
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    } else {
      // Update portal fields if they changed
      await userRef.update({
        workspaceId,
        role: 'portal',
        portalFolderId: folderId,
        updatedAt: FieldValue.serverTimestamp(),
      })
    }

    // 6. Add to workspace memberIds if not present
    const workspaceRef = db.collection(COLLECTIONS.workspaces).doc(workspaceId)
    await workspaceRef.update({
      memberIds: FieldValue.arrayUnion(uid),
    })

    // 7. Generate custom token
    const customToken = await adminAuth.createCustomToken(uid, {
      portalFolderId: folderId,
      role: 'portal',
    })

    return NextResponse.json({
      customToken,
      workspaceId,
      folderId,
      folderName,
    })
  } catch (error) {
    console.error('[portal/provision] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 },
    )
  }
}
