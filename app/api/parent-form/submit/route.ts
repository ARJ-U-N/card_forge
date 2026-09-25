/**
 * POST /api/parent-form/submit
 *
 * Public endpoint (no auth). Validates the share token, then creates
 * a member document in the linked subfolder via Admin Firestore.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { COLLECTIONS } from '@/lib/models/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { shareToken, values, imageData } = body as {
      shareToken?: string
      values?: Record<string, string>
      imageData?: Record<string, string>
    }

    if (!shareToken) {
      return NextResponse.json({ error: 'shareToken is required.' }, { status: 400 })
    }

    const db = getAdminFirestore()

    // 1. Re-validate token
    const shareSnap = await db
      .collection(COLLECTIONS.parentShares)
      .where('shareToken', '==', shareToken)
      .limit(1)
      .get()

    if (shareSnap.empty) {
      return NextResponse.json({ error: 'Invalid share link.' }, { status: 404 })
    }

    const share = shareSnap.docs[0].data()

    if (!share.enabled) {
      return NextResponse.json({ error: 'This share link has been disabled.' }, { status: 403 })
    }

    const workspaceId = share.workspaceId as string
    const folderId = share.folderId as string
    const subfolderId = share.subfolderId as string

    // 2. Get next row number for this subfolder
    const membersRef = db
      .collection(COLLECTIONS.workspaces)
      .doc(workspaceId)
      .collection(COLLECTIONS.members)

    const rowSnap = await membersRef
      .where('folderId', '==', folderId)
      .where('subfolderId', '==', subfolderId)
      .orderBy('rowNumber', 'desc')
      .limit(1)
      .get()

    let nextRow = 1
    if (!rowSnap.empty) {
      const maxRow = rowSnap.docs[0].data().rowNumber
      nextRow = (typeof maxRow === 'number' ? maxRow : 0) + 1
    }

    // 3. Build member document
    // Image data (base64 data URLs) goes into the known image fields
    // All text values go into customFields
    const memberData: Record<string, unknown> = {
      workspaceId,
      folderId,
      subfolderId,
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      title: '',
      gender: '',
      employeeId: '',
      idNumber: '',
      department: '',
      hireDate: '',
      expireDate: '',
      parentPhone: '',
      branch: '',
      roomId: '',
      profileImage: imageData?.profileImage ?? '',
      signature: imageData?.signature ?? '',
      fingerprint: imageData?.fingerprint ?? '',
      divisionLogo: imageData?.divisionLogo ?? '',
      rowNumber: nextRow,
      customFields: values ?? {},
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }

    const docRef = await membersRef.add(memberData)

    return NextResponse.json({
      success: true,
      memberId: docRef.id,
    })
  } catch (error) {
    console.error('[parent-form/submit] Error:', error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
