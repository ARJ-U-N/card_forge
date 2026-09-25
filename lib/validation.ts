/**
 * Centralized validation and sanitization utilities.
 * Used across uploads, imports, form inputs, and API boundaries.
 */

// ---------------------------------------------------------------------------
// File validation
// ---------------------------------------------------------------------------

/** Allowed image MIME types */
export const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
])

/** Allowed import file types */
export const ALLOWED_IMPORT_TYPES = new Set([
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

/** Max file sizes in bytes */
export const MAX_FILE_SIZES = {
  image: 10 * 1024 * 1024,    // 10 MB
  import: 50 * 1024 * 1024,   // 50 MB
  asset: 10 * 1024 * 1024,    // 10 MB
} as const

export interface FileValidationResult {
  valid: boolean
  error?: string
}

export function validateImageFile(file: File): FileValidationResult {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return {
      valid: false,
      error: `Invalid file type "${file.type}". Allowed: JPEG, PNG, GIF, WebP, SVG, BMP.`,
    }
  }
  if (file.size > MAX_FILE_SIZES.image) {
    return {
      valid: false,
      error: `File too large (${formatFileSize(file.size)}). Maximum: ${formatFileSize(MAX_FILE_SIZES.image)}.`,
    }
  }
  if (!validateFilename(file.name)) {
    return { valid: false, error: 'Invalid filename. Remove special characters.' }
  }
  return { valid: true }
}

export function validateImportFile(file: File): FileValidationResult {
  // Allow by extension if MIME type is not recognized
  const ext = file.name.split('.').pop()?.toLowerCase()
  const validExt = ['csv', 'xls', 'xlsx'].includes(ext ?? '')
  if (!ALLOWED_IMPORT_TYPES.has(file.type) && !validExt) {
    return {
      valid: false,
      error: 'Invalid file type. Allowed: CSV, XLS, XLSX.',
    }
  }
  if (file.size > MAX_FILE_SIZES.import) {
    return {
      valid: false,
      error: `File too large (${formatFileSize(file.size)}). Maximum: ${formatFileSize(MAX_FILE_SIZES.import)}.`,
    }
  }
  return { valid: true }
}

export function validateAssetFile(file: File): FileValidationResult {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return {
      valid: false,
      error: `Invalid file type. Allowed: JPEG, PNG, GIF, WebP, SVG, BMP.`,
    }
  }
  if (file.size > MAX_FILE_SIZES.asset) {
    return {
      valid: false,
      error: `File too large (${formatFileSize(file.size)}). Maximum: ${formatFileSize(MAX_FILE_SIZES.asset)}.`,
    }
  }
  if (!validateFilename(file.name)) {
    return { valid: false, error: 'Invalid filename.' }
  }
  return { valid: true }
}

// ---------------------------------------------------------------------------
// Filename validation
// ---------------------------------------------------------------------------

/** Block path traversal, null bytes, and very long names */
export function validateFilename(name: string): boolean {
  if (!name || name.length > 255) return false
  if (name.includes('..') || name.includes('\0')) return false
  // Block path separators
  if (/[/\\]/.test(name)) return false
  return true
}

/** Sanitize a filename for safe storage */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\:*?"<>|\0]/g, '_')
    .replace(/\.{2,}/g, '.')
    .slice(0, 200)
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

/** Sanitize text input — trim and limit length */
export function sanitizeText(text: string, maxLength = 500): string {
  return text.trim().slice(0, maxLength)
}

/** Validate email format */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/** Validate that a PIN is numeric and of expected length */
export function isValidPin(pin: string, minLength = 4, maxLength = 8): boolean {
  return /^\d+$/.test(pin) && pin.length >= minLength && pin.length <= maxLength
}

/** Validate workspace name */
export function isValidWorkspaceName(name: string): boolean {
  const trimmed = name.trim()
  return trimmed.length >= 1 && trimmed.length <= 100
}

/** Validate member name fields */
export function isValidName(name: string): boolean {
  const trimmed = name.trim()
  return trimmed.length >= 1 && trimmed.length <= 150
}

// ---------------------------------------------------------------------------
// Workspace isolation guard
// ---------------------------------------------------------------------------

/**
 * Client-side guard: ensures the workspaceId matches what's expected.
 * This is a defense-in-depth layer — Firestore rules are the real enforcement.
 */
export function assertWorkspaceAccess(
  userWorkspaceId: string,
  resourceWorkspaceId: string,
  resourceType = 'resource',
): void {
  if (!userWorkspaceId) {
    throw new Error('Not authenticated: no workspace ID')
  }
  if (userWorkspaceId !== resourceWorkspaceId) {
    throw new Error(`Access denied: ${resourceType} belongs to a different workspace`)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
