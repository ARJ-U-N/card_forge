/**
 * Server-side Google Drive credential management.
 *
 * Stores and retrieves the print shop owner's Google OAuth tokens
 * in a protected Firestore document: system/driveCredentials
 *
 * This file must ONLY be imported in server-side code (API routes).
 * It uses Firebase Admin SDK for privileged Firestore access, which
 * bypasses security rules — allowing us to keep system/driveCredentials
 * completely locked down from client-side access.
 *
 * We use the googleapis library's OAuth2 client for token management.
 * The service account (Admin SDK) is ONLY used for Firestore — Google Drive
 * files continue to belong to the print shop owner's personal Google account.
 */
import { google } from 'googleapis'
import { getAdminFirestore } from './admin'

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

function getClientId(): string {
  const v = process.env.GOOGLE_CLIENT_ID
  if (!v) throw new Error('Missing GOOGLE_CLIENT_ID environment variable')
  return v
}

function getClientSecret(): string {
  const v = process.env.GOOGLE_CLIENT_SECRET
  if (!v) throw new Error('Missing GOOGLE_CLIENT_SECRET environment variable')
  return v
}

function getRedirectUri(): string {
  return process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/drive/auth/callback'
}

// ---------------------------------------------------------------------------
// OAuth2 client
// ---------------------------------------------------------------------------

export function createOAuth2Client() {
  return new google.auth.OAuth2(getClientId(), getClientSecret(), getRedirectUri())
}

// ---------------------------------------------------------------------------
// Credentials stored in Firestore (server-side only, via Admin SDK)
// ---------------------------------------------------------------------------

export interface DriveCredentials {
  accessToken: string
  refreshToken: string
  expiresAt: number // epoch ms
  rootFolderId: string | null
  updatedAt: string
}

/** Firestore document path for the Drive credentials */
const CREDS_DOC_PATH = 'system/driveCredentials'

export async function getDriveCredentials(): Promise<DriveCredentials | null> {
  try {
    const db = getAdminFirestore()
    const snap = await db.doc(CREDS_DOC_PATH).get()

    if (!snap.exists) return null

    const data = snap.data()
    if (!data) return null

    return {
      accessToken: data.accessToken ?? '',
      refreshToken: data.refreshToken ?? '',
      expiresAt: typeof data.expiresAt === 'number' ? data.expiresAt : Number(data.expiresAt ?? 0),
      rootFolderId: data.rootFolderId || null,
      updatedAt: data.updatedAt ?? '',
    }
  } catch {
    return null
  }
}

export async function saveDriveCredentials(creds: DriveCredentials): Promise<void> {
  const db = getAdminFirestore()
  await db.doc(CREDS_DOC_PATH).set(
    {
      accessToken: creds.accessToken,
      refreshToken: creds.refreshToken,
      expiresAt: creds.expiresAt,
      rootFolderId: creds.rootFolderId ?? '',
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  )
}

export async function updateRootFolderId(folderId: string): Promise<void> {
  const db = getAdminFirestore()
  await db.doc(CREDS_DOC_PATH).set(
    {
      rootFolderId: folderId,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  )
}

// ---------------------------------------------------------------------------
// Authenticated Drive client
// ---------------------------------------------------------------------------

/**
 * Returns an authenticated OAuth2 client with valid tokens.
 * Auto-refreshes the access token if expired.
 * Throws if no credentials are stored (owner hasn't connected).
 */
export async function getAuthenticatedDriveClient() {
  const creds = await getDriveCredentials()
  if (!creds || !creds.refreshToken) {
    throw new DriveNotConnectedError()
  }

  const oauth2 = createOAuth2Client()
  oauth2.setCredentials({
    access_token: creds.accessToken,
    refresh_token: creds.refreshToken,
    expiry_date: creds.expiresAt,
  })

  // If token is expired or will expire in the next 60 seconds, refresh
  if (Date.now() > creds.expiresAt - 60_000) {
    try {
      const { credentials } = await oauth2.refreshAccessToken()
      oauth2.setCredentials(credentials)

      // Persist the refreshed tokens
      await saveDriveCredentials({
        accessToken: credentials.access_token ?? creds.accessToken,
        refreshToken: credentials.refresh_token ?? creds.refreshToken,
        expiresAt: credentials.expiry_date ?? Date.now() + 3600_000,
        rootFolderId: creds.rootFolderId,
        updatedAt: new Date().toISOString(),
      })
    } catch (err) {
      throw new DriveNotConnectedError(
        'Google Drive authorization has expired. Please reconnect.',
      )
    }
  }

  return { oauth2, drive: google.drive({ version: 'v3', auth: oauth2 }), creds }
}

export class DriveNotConnectedError extends Error {
  readonly code = 'DRIVE_AUTH_REQUIRED'
  constructor(message = 'Google Drive is not connected. Owner must authorize.') {
    super(message)
    this.name = 'DriveNotConnectedError'
  }
}

// ---------------------------------------------------------------------------
// Root folder management
// ---------------------------------------------------------------------------

const ROOT_FOLDER_NAME = 'CardForge'

/**
 * Find or create the "CardForge" root folder in the owner's My Drive.
 * Caches the folder ID in Firestore so we don't search every time.
 */
export async function getOrCreateRootFolder(): Promise<string> {
  const { drive, creds } = await getAuthenticatedDriveClient()

  // Return cached ID if we have one and it still exists
  if (creds.rootFolderId) {
    try {
      const check = await drive.files.get({
        fileId: creds.rootFolderId,
        fields: 'id,trashed',
      })
      if (check.data.id && !check.data.trashed) {
        return creds.rootFolderId
      }
    } catch {
      // Folder not found or inaccessible, will recreate
    }
  }

  // Search for existing folder
  const searchRes = await drive.files.list({
    q: `name='${ROOT_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`,
    fields: 'files(id,name)',
    spaces: 'drive',
  })

  if (searchRes.data.files && searchRes.data.files.length > 0) {
    const folderId = searchRes.data.files[0].id!
    await updateRootFolderId(folderId)
    return folderId
  }

  // Create new root folder
  const createRes = await drive.files.create({
    requestBody: {
      name: ROOT_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  })

  const folderId = createRes.data.id!
  await updateRootFolderId(folderId)
  return folderId
}

/**
 * Find or create a workspace folder under the CardForge root.
 * Structure: CardForge/{workspaceId}/
 */
export async function getOrCreateWorkspaceFolder(workspaceId: string): Promise<string> {
  const rootId = await getOrCreateRootFolder()
  return findOrCreateFolder(workspaceId, rootId)
}

/**
 * Find or create a subfolder within a parent folder.
 */
export async function findOrCreateFolder(name: string, parentId: string): Promise<string> {
  const { drive } = await getAuthenticatedDriveClient()

  // Search for existing
  const searchRes = await drive.files.list({
    q: `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: 'files(id,name)',
    spaces: 'drive',
  })

  if (searchRes.data.files && searchRes.data.files.length > 0) {
    return searchRes.data.files[0].id!
  }

  // Create
  const createRes = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  })

  return createRes.data.id!
}
