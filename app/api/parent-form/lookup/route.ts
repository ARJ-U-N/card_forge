/**
 * GET /api/parent-form/lookup?token=...
 *
 * Public endpoint (no auth). Looks up a parent share by token,
 * loads the table definition from the MAIN College folder
 * (subfolders inherit the table), and returns everything the
 * parent form needs to render.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { COLLECTIONS } from '@/lib/models/types'

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')
    if (!token) {
      return NextResponse.json({ error: 'Token is required.' }, { status: 400 })
    }

    const db = getAdminFirestore()

    // 1. Look up ParentShare by token
    const shareSnap = await db
      .collection(COLLECTIONS.parentShares)
      .where('shareToken', '==', token)
      .limit(1)
      .get()

    if (shareSnap.empty) {
      return NextResponse.json({ error: 'Invalid share link.' }, { status: 404 })
    }

    const share = shareSnap.docs[0].data()

    if (!share.enabled) {
      return NextResponse.json({ error: 'This share link has been disabled.' }, { status: 403 })
    }

    // 2. Load table definition from the MAIN/root College folder
    //    (subfolders inherit the table — they don't have their own)
    const folderSnap = await db
      .collection(COLLECTIONS.workspaces)
      .doc(share.workspaceId)
      .collection(COLLECTIONS.folders)
      .doc(share.folderId)
      .get()

    if (!folderSnap.exists) {
      return NextResponse.json({ error: 'College folder not found.' }, { status: 404 })
    }

    const folder = folderSnap.data()!
    const tableColumns: string[] = Array.isArray(folder.tableColumns) ? folder.tableColumns : []
    const tableColumnTypes: Record<string, string> = folder.tableColumnTypes ?? {}

    if (tableColumns.length === 0) {
      return NextResponse.json(
        { error: 'No table defined for this College yet.' },
        { status: 404 },
      )
    }

    // 3. Load a saved Design linked to this main folder (for ID preview)
    const designSnap = await db
      .collection(COLLECTIONS.workspaces)
      .doc(share.workspaceId as string)
      .collection(COLLECTIONS.designs)
      .where('folderId', '==', share.folderId)
      .orderBy('updatedAt', 'desc')
      .limit(1)
      .get()

    let design: Record<string, unknown> | null = null
    if (!designSnap.empty) {
      const d = designSnap.docs[0].data()
      design = {
        id: designSnap.docs[0].id,
        cardConfiguration: d.cardConfiguration ?? null,
        frontDocument: d.frontDocument ?? null,
        backDocument: d.backDocument ?? null,
      }
    }

    return NextResponse.json({
      folderName: share.folderName ?? '',
      subfolderName: share.subfolderName ?? '',
      folderId: share.folderId,
      subfolderId: share.subfolderId,
      workspaceId: share.workspaceId,
      tableColumns,
      tableColumnTypes,
      design,
    })
  } catch (error) {
    console.error('[parent-form/lookup] Error:', error)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
