/**
 * POST /api/drive/folder
 *
 * Creates or finds a folder in Google Drive.
 *
 * Expects JSON body:
 *   - workspaceId: string
 *   - name: string
 *   - parentId?: string (Drive folder ID, optional)
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  getOrCreateWorkspaceFolder,
  findOrCreateFolder,
  DriveNotConnectedError,
} from '@/lib/firebase/drive-credentials'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { workspaceId, name, parentId } = body as {
      workspaceId?: string
      name?: string
      parentId?: string
    }

    if (!workspaceId || !name) {
      return NextResponse.json(
        { error: 'Missing required fields: workspaceId, name' },
        { status: 400 },
      )
    }

    let folderId: string

    if (parentId) {
      folderId = await findOrCreateFolder(name, parentId)
    } else {
      // Create under the workspace folder
      const wsFolder = await getOrCreateWorkspaceFolder(workspaceId)
      folderId = await findOrCreateFolder(name, wsFolder)
    }

    return NextResponse.json({ folderId })
  } catch (error) {
    if (error instanceof DriveNotConnectedError) {
      return NextResponse.json(
        { error: error.message, code: 'DRIVE_AUTH_REQUIRED' },
        { status: 401 },
      )
    }

    console.error('[drive/folder]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Folder creation failed' },
      { status: 500 },
    )
  }
}
