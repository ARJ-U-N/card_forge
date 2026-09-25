/**
 * Core Firestore document shapes. Timestamps are stored as Firestore
 * Timestamps and exposed to the UI as ISO strings via the mappers in
 * lib/firebase/*.ts so components never depend on the SDK.
 */

export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer' | 'portal'

export interface UserProfile {
  displayName: string
  photoURL: string | null
  jobTitle: string | null
  phone: string | null
}

export interface User {
  id: string
  email: string
  /** Firebase Auth UID — the auth reference. Passwords are never stored here. */
  authUid: string
  workspaceId: string
  role: WorkspaceRole
  /** For portal users: the main College folder they are restricted to. */
  portalFolderId?: string
  profile: UserProfile
  createdAt: string
  updatedAt: string
}

export interface Workspace {
  id: string
  name: string
  ownerId: string
  /** Denormalized member list so security rules can check membership cheaply. */
  memberIds: string[]
  plan: 'free' | 'team' | 'enterprise'
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Phase 2 — Data Upload / Member Management
// ---------------------------------------------------------------------------

export type Gender = 'male' | 'female' | 'other' | ''

/**
 * A folder (or subfolder) that organises members inside a workspace.
 * Root folders have `parentFolderId = null`; subfolders point to their parent.
 */
export interface Folder {
  id: string
  workspaceId: string
  name: string
  /** null = top-level folder. Non-null = this is a subfolder. */
  parentFolderId: string | null
  /** Teacher-defined or Excel-imported column headings for this folder's table */
  tableColumns?: string[]
  /** Per-column type metadata. Key = column heading, value = 'text' | 'image'. Columns not listed default to 'text'. */
  tableColumnTypes?: Record<string, 'text' | 'image'>
  /** Expected total number of members for this folder */
  folderTotalNumber?: number
  /** ISO timestamp when teacher submitted/locked this folder. null = not submitted. */
  submittedAt?: string | null
  createdAt: string
  updatedAt: string
}

/**
 * A member record that belongs to a folder (and optionally a subfolder).
 * Image fields store URLs for secure retrieval (e.g. /api/drive/download/{fileId}).
 */
export interface Member {
  id: string
  workspaceId: string
  folderId: string
  /** null when the member is directly in the folder (not in a subfolder). */
  subfolderId: string | null
  firstName: string
  lastName: string
  dateOfBirth: string
  title: string
  gender: Gender
  employeeId: string
  idNumber: string
  department: string
  hireDate: string
  expireDate: string
  parentPhone: string
  branch: string
  roomId: string
  /** Image URL for profile photo (Drive proxy or data URL) */
  profileImage: string
  /** Image URL for signature (Drive proxy or data URL) */
  signature: string
  /** Image URL for fingerprint (Drive proxy or data URL) */
  fingerprint: string
  /** Image URL for division logo (Drive proxy or data URL) */
  divisionLogo: string
  /** Stable per-subfolder row number (1, 2, 3…). Assigned at creation, never changes. */
  rowNumber?: number
  /** Arbitrary key-value pairs for workspace-specific data */
  customFields: Record<string, string>
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Phase 3 — Collaborator Portal
// ---------------------------------------------------------------------------

/**
 * A portal grants external collaborators PIN-protected read access to a
 * workspace's member data. The PIN is stored as a SHA-256 hash.
 */
export interface Portal {
  id: string
  workspaceId: string
  /** The main/root College folder this portal belongs to. */
  folderId: string
  /** Denormalized folder name for display purposes. */
  folderName: string
  enabled: boolean
  /** Cryptographically random URL-safe token used in the portal URL. */
  portalToken: string
  /** SHA-256 hex digest of the numeric PIN. Never store plaintext. */
  pinHash: string
  collaboratorEmail: string
  notificationEnabled: boolean
  createdAt: string
  updatedAt: string
}

/**
 * A parent share link grants unauthenticated parents access to submit
 * their details into a specific subfolder. One share per subfolder.
 */
export interface ParentShare {
  id: string
  workspaceId: string
  /** Main College folder (owns the table definition). */
  folderId: string
  /** The specific subfolder this share link targets. */
  subfolderId: string
  /** Denormalized College name. */
  folderName: string
  /** Denormalized subfolder name (e.g. "Class 8"). */
  subfolderName: string
  /** Crypto-random URL-safe token for the public link. */
  shareToken: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Phase 4 — Designer
// ---------------------------------------------------------------------------

export type CardOrientation = 'horizontal' | 'vertical'
export type CardMaterial = '30mil-pvc' | 'adhesive-pvc'
export type BackType = 'none' | 'bw' | 'full-color'
export type SlotPunch = 'none' | 'short' | 'long'

export interface CardConfiguration {
  orientation: CardOrientation
  material: CardMaterial
  backType: BackType
  slotPunch: SlotPunch
  frontBackground: string
  backBackground: string
  safeZoneMargin: number
  textBoundaries: boolean
  /** Whether the card has a back side. Defaults to true for backward compatibility. */
  isDoubleSide: boolean
}

export const DEFAULT_CARD_CONFIG: CardConfiguration = {
  orientation: 'horizontal',
  material: '30mil-pvc',
  backType: 'full-color',
  slotPunch: 'none',
  frontBackground: '#ffffff',
  backBackground: '#ffffff',
  safeZoneMargin: 5,
  textBoundaries: true,
  isDoubleSide: true,
}

/** A positioned element on the card canvas. */
export interface CanvasElement {
  id: string
  type: 'text' | 'image' | 'shape' | 'field'
  x: number
  y: number
  width: number
  height: number
  rotation: number
  /** Type-specific properties (fontSize, src, fill, fieldName, etc.) */
  props: Record<string, unknown>
  locked: boolean
  visible: boolean
  zIndex: number
}

/** The serialised state of one side of a card. */
export interface CardDocument {
  elements: CanvasElement[]
  background: string
}

/**
 * A saved card design belonging to a workspace.
 */
export interface Design {
  id: string
  workspaceId: string
  name: string
  /** ID of the template this design was started from, or null for blank. */
  templateId: string | null
  /** The main school/folder this design belongs to. null = legacy/unlinked design. */
  folderId: string | null
  cardConfiguration: CardConfiguration
  frontDocument: CardDocument
  backDocument: CardDocument
  createdAt: string
  updatedAt: string
}

/** An official or user-created card template. */
export interface Template {
  id: string
  name: string
  previewImage: string
  /** 'official' templates ship with the app; 'user' templates are created by workspace owners. */
  status: 'official' | 'user'
  workspaceId: string | null
  cardConfiguration: CardConfiguration
  frontDocument: CardDocument
  backDocument: CardDocument
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Asset Library
// ---------------------------------------------------------------------------

export type AssetCategory = 'image' | 'logo' | 'signature' | 'other'
export type UploadStatus = 'pending' | 'uploaded' | 'failed'

/** A reusable workspace-level asset (image, logo, signature, etc.) */
export interface Asset {
  id: string
  workspaceId: string
  name: string
  category: AssetCategory
  /** URL for secure retrieval (e.g. /api/drive/download/{fileId}) */
  url: string
  /** Stable Google Drive file ID for deletion / management */
  driveFileId: string
  /** Upload lifecycle status */
  uploadStatus: UploadStatus
  /** MIME type */
  mimeType: string
  /** File size in bytes */
  sizeBytes: number
  createdAt: string
  updatedAt: string
}

/** Collection names, centralized so later phases share one source of truth. */
export const COLLECTIONS = {
  users: 'users',
  workspaces: 'workspaces',
  templates: 'templates',
  members: 'members',
  departments: 'departments',
  folders: 'folders',
  jobs: 'jobs',
  portals: 'portals',
  designs: 'designs',
  assets: 'assets',
  parentShares: 'parentShares',
} as const

