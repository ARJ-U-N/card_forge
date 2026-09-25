import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from './client'
import { COLLECTIONS, type Portal } from '@/lib/models/types'

// ---------------------------------------------------------------------------
// Crypto helpers (client-side, Web Crypto API)
// ---------------------------------------------------------------------------

/** Generate a cryptographically random URL-safe token (32 bytes → 43 chars). */
export function generatePortalToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  // Base64url encode
  const base64 = btoa(String.fromCharCode(...bytes))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** SHA-256 hash of a plain-text PIN → hex string. */
export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(pin)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ---------------------------------------------------------------------------
// Firestore helpers
// ---------------------------------------------------------------------------

function portalsCol() {
  return collection(getDb(), COLLECTIONS.portals)
}

function portalDoc(portalId: string) {
  return doc(getDb(), COLLECTIONS.portals, portalId)
}

function toIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString()
  return new Date().toISOString()
}

function mapPortal(snap: DocumentSnapshot<DocumentData>): Portal | null {
  const d = snap.data()
  if (!d) return null
  return {
    id: snap.id,
    workspaceId: d.workspaceId ?? '',
    folderId: d.folderId ?? '',
    folderName: d.folderName ?? '',
    enabled: d.enabled ?? false,
    portalToken: d.portalToken ?? '',
    pinHash: d.pinHash ?? '',
    collaboratorEmail: d.collaboratorEmail ?? '',
    notificationEnabled: d.notificationEnabled ?? false,
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
  }
}

// ---------------------------------------------------------------------------
// CRUD — Portal documents are keyed by folderId
// ---------------------------------------------------------------------------

/**
 * Get or create the portal document for a main College folder.
 * Each main folder has exactly one portal (keyed by folderId).
 */
export async function getOrCreatePortal(
  workspaceId: string,
  folderId: string,
  folderName: string,
): Promise<Portal> {
  const ref = portalDoc(folderId)
  const snap = await getDoc(ref)
  if (snap.exists()) {
    return mapPortal(snap)!
  }

  // Create default portal (disabled)
  const token = generatePortalToken()
  const defaultPin = '0000'
  const pinH = await hashPin(defaultPin)

  const data = {
    workspaceId,
    folderId,
    folderName,
    enabled: false,
    portalToken: token,
    pinHash: pinH,
    collaboratorEmail: '',
    notificationEnabled: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  await setDoc(ref, data)
  const created = await getDoc(ref)
  return mapPortal(created)!
}

export function subscribePortal(
  folderId: string,
  onChange: (portal: Portal | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(portalDoc(folderId), (snap) => onChange(mapPortal(snap)), onError)
}

export async function updatePortalSettings(
  folderId: string,
  updates: Partial<{
    enabled: boolean
    collaboratorEmail: string
    notificationEnabled: boolean
    folderName: string
  }>,
): Promise<void> {
  await updateDoc(portalDoc(folderId), {
    ...updates,
    updatedAt: serverTimestamp(),
  })
}

export async function updatePortalPin(
  folderId: string,
  newPin: string,
): Promise<void> {
  const pinH = await hashPin(newPin)
  await updateDoc(portalDoc(folderId), {
    pinHash: pinH,
    updatedAt: serverTimestamp(),
  })
}

export async function regeneratePortalToken(
  folderId: string,
): Promise<string> {
  const token = generatePortalToken()
  await updateDoc(portalDoc(folderId), {
    portalToken: token,
    updatedAt: serverTimestamp(),
  })
  return token
}

/** Delete a portal configuration. Only removes the portal doc — does NOT affect folder/members/designs. */
export async function deletePortal(folderId: string): Promise<void> {
  await deleteDoc(portalDoc(folderId))
}

// ---------------------------------------------------------------------------
// Workspace-level queries
// ---------------------------------------------------------------------------

/** Get all portals belonging to a workspace. */
export async function getPortalsForWorkspace(workspaceId: string): Promise<Portal[]> {
  const q = query(portalsCol(), where('workspaceId', '==', workspaceId))
  const snap = await getDocs(q)
  return snap.docs.map(mapPortal).filter((p): p is Portal => p !== null)
}

/** Real-time subscription to all portals in a workspace. */
export function subscribePortalsForWorkspace(
  workspaceId: string,
  onChange: (portals: Portal[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(portalsCol(), where('workspaceId', '==', workspaceId))
  return onSnapshot(
    q,
    (snap) => {
      const portals = snap.docs.map(mapPortal).filter((p): p is Portal => p !== null)
      onChange(portals)
    },
    onError,
  )
}

// ---------------------------------------------------------------------------
// Public portal access (no auth required — looks up by token)
// ---------------------------------------------------------------------------

export async function getPortalByToken(token: string): Promise<Portal | null> {
  const q = query(portalsCol(), where('portalToken', '==', token))
  const snap = await getDocs(q)
  if (snap.empty) return null
  return mapPortal(snap.docs[0])
}

export async function verifyPortalPin(
  portalId: string,
  pin: string,
): Promise<boolean> {
  const snap = await getDoc(portalDoc(portalId))
  const data = snap.data()
  if (!data) return false
  const inputHash = await hashPin(pin)
  return data.pinHash === inputHash
}
