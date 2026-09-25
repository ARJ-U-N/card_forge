/**
 * POST /api/parent-form/share
 *
 * Authenticated endpoint. Creates or retrieves a parent share link
 * for a subfolder, using Admin Firestore to bypass security rules.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/models/types'
import { generatePortalToken } from '@/lib/firebase/portal-repository'
import { FieldValue } from 'firebase-admin/firestore'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { workspaceId, folderId, subfolderId, folderName, subfolderName } = body as {
      workspaceId?: string
      folderId?: string
      subfolderId?: string
      folderName?: string
      subfolderName?: string
    }

    if (!workspaceId || !folderId || !subfolderId) {
      return NextResponse.json(
        { error: 'workspaceId, folderId, and subfolderId are required.' },
        { status: 400 },
      )
    }

    const db = getAdminFirestore()

    // Check if a design exists for this main folder
    const designSnap = await db
      .collection(COLLECTIONS.workspaces)
      .doc(workspaceId)
      .collection(COLLECTIONS.designs)
      .where('folderId', '==', folderId)
      .orderBy('updatedAt', 'desc')
      .limit(1)
      .get()
    const hasDesign = !designSnap.empty

    // Check if the main folder has a table
    const folderSnap = await db
      .collection(COLLECTIONS.workspaces)
      .doc(workspaceId)
      .collection(COLLECTIONS.folders)
      .doc(folderId)
      .get()
    const folderData = folderSnap.data()
    const hasTable = Array.isArray(folderData?.tableColumns) && folderData.tableColumns.length > 0

    const ref = db.collection(COLLECTIONS.parentShares).doc(subfolderId)
    const snap = await ref.get()

    if (snap.exists) {
      const data = snap.data()!
      return NextResponse.json({
        id: snap.id,
        workspaceId: data.workspaceId ?? '',
        folderId: data.folderId ?? '',
        subfolderId: data.subfolderId ?? '',
        folderName: data.folderName ?? '',
        subfolderName: data.subfolderName ?? '',
        shareToken: data.shareToken ?? '',
        enabled: data.enabled ?? true,
        hasDesign,
        hasTable,
      })
    }

    // Create new share
    const token = generatePortalToken()
    const newData = {
      workspaceId,
      folderId,
      subfolderId,
      folderName: folderName ?? '',
      subfolderName: subfolderName ?? '',
      shareToken: token,
      enabled: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }

    await ref.set(newData)

    return NextResponse.json({
      id: subfolderId,
      workspaceId,
      folderId,
      subfolderId,
      folderName: folderName ?? '',
      subfolderName: subfolderName ?? '',
      shareToken: token,
      enabled: true,
      hasDesign,
      hasTable,
    })
  } catch (error) {
    console.error('[parent-form/share] Error:', error)
    return NextResponse.json({ error: 'Failed to create share link.' }, { status: 500 })
  }
}

/**
 * PATCH /api/parent-form/share
 *
 * Update parent share settings (enable/disable).
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { subfolderId, enabled } = body as {
      subfolderId?: string
      enabled?: boolean
    }

    if (!subfolderId || typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'subfolderId and enabled are required.' },
        { status: 400 },
      )
    }

    const db = getAdminFirestore()
    await db.collection(COLLECTIONS.parentShares).doc(subfolderId).update({
      enabled,
      updatedAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[parent-form/share] PATCH Error:', error)
    return NextResponse.json({ error: 'Failed to update share.' }, { status: 500 })
  }
}
