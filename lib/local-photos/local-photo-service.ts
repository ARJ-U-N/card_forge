/**
 * Local photo folder service.
 *
 * Browser-only utilities for selecting local directories, checking
 * permissions, and enumerating image files. These build on the
 * File System Access API (Chromium ≥ 86).
 *
 * Do not import from server components or API routes.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Permission status for a mapped directory. */
export type MappingPermissionStatus =
  | 'available' // Permission is granted; directory can be read
  | 'permission-needed' // Handle exists but permission must be re-requested
  | 'unavailable' // Handle exists but access cannot be restored

/** Result of enumerating image files in a directory. */
export interface DirectoryEnumerationResult {
  /** Number of image files found */
  imageCount: number
  /** Total number of entries (files + directories) */
  totalEntries: number
  /** List of image file names */
  imageFileNames: string[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** File extensions treated as images. */
const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'bmp',
  'webp',
  'tiff',
  'tif',
  'svg',
])

// ---------------------------------------------------------------------------
// Browser support
// ---------------------------------------------------------------------------

/**
 * Check whether the File System Access API is available in this browser.
 * Returns false during SSR and in browsers that lack the API.
 */
export function isFileSystemAccessSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.showDirectoryPicker === 'function'
  )
}

// ---------------------------------------------------------------------------
// Directory selection
// ---------------------------------------------------------------------------

/**
 * Open the system directory picker.
 *
 * Must be called in response to a user gesture (click, keypress, etc.).
 * Returns the selected directory handle, or null if the user cancelled.
 *
 * @throws Error if the API is not supported or an unexpected error occurs.
 */
export async function selectDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFileSystemAccessSupported()) {
    throw new Error(
      'This browser does not support the File System Access API. ' +
        'Please use Google Chrome or Microsoft Edge (version 86 or later).',
    )
  }

  try {
    const handle = await window.showDirectoryPicker!({ mode: 'read' })
    return handle
  } catch (err) {
    // User cancelled the picker — not an error
    if (err instanceof DOMException && err.name === 'AbortError') {
      return null
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// Permission management
// ---------------------------------------------------------------------------

/**
 * Check the current read permission state of a directory handle
 * without prompting the user.
 */
export async function checkPermission(
  handle: FileSystemDirectoryHandle,
): Promise<MappingPermissionStatus> {
  try {
    if (typeof handle.queryPermission !== 'function') {
      // Browser supports handles but not permission queries —
      // attempt to read to test access
      return await probeAccess(handle)
    }

    const state = await handle.queryPermission({ mode: 'read' })
    switch (state) {
      case 'granted':
        return 'available'
      case 'prompt':
        return 'permission-needed'
      case 'denied':
      default:
        return 'unavailable'
    }
  } catch {
    return 'unavailable'
  }
}

/**
 * Request read permission on a directory handle.
 *
 * Must be called in response to a user gesture.
 * Returns the resulting permission status.
 */
export async function requestPermission(
  handle: FileSystemDirectoryHandle,
): Promise<MappingPermissionStatus> {
  try {
    if (typeof handle.requestPermission !== 'function') {
      return await probeAccess(handle)
    }

    const state = await handle.requestPermission({ mode: 'read' })
    switch (state) {
      case 'granted':
        return 'available'
      case 'prompt':
        return 'permission-needed'
      case 'denied':
      default:
        return 'unavailable'
    }
  } catch {
    return 'unavailable'
  }
}

/**
 * Fallback: attempt to iterate the directory to determine if access works.
 */
async function probeAccess(
  handle: FileSystemDirectoryHandle,
): Promise<MappingPermissionStatus> {
  try {
    const iter = handle.entries()
    await iter.next()
    return 'available'
  } catch {
    return 'permission-needed'
  }
}

// ---------------------------------------------------------------------------
// Directory enumeration
// ---------------------------------------------------------------------------

/**
 * Enumerate the immediate child entries of a directory and identify
 * image files by their file extension.
 *
 * Does NOT read file contents into memory, generate blob URLs, or
 * recurse into subdirectories.
 */
export async function enumerateImageFiles(
  handle: FileSystemDirectoryHandle,
): Promise<DirectoryEnumerationResult> {
  const imageFileNames: string[] = []
  let totalEntries = 0

  try {
    const iter = handle.entries()
    let next = await iter.next()
    while (!next.done) {
      const [name, entryHandle] = next.value
      totalEntries++
      if (entryHandle.kind === 'file' && isImageFile(name)) {
        imageFileNames.push(name)
      }
      next = await iter.next()
    }
  } catch (err) {
    throw new Error(
      `Failed to read directory "${handle.name}": ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
  }

  return {
    imageCount: imageFileNames.length,
    totalEntries,
    imageFileNames,
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Check whether a filename has a known image extension. */
function isImageFile(filename: string): boolean {
  const dot = filename.lastIndexOf('.')
  if (dot < 0) return false
  const ext = filename.slice(dot + 1).toLowerCase()
  return IMAGE_EXTENSIONS.has(ext)
}

// ---------------------------------------------------------------------------
// Preview URL management
// ---------------------------------------------------------------------------

/**
 * Create a temporary blob URL for previewing a specific file from a directory.
 *
 * The caller is responsible for revoking the URL with `revokePreviewUrl()`
 * when it is no longer needed to prevent memory leaks.
 *
 * @param dirHandle  The directory handle containing the file.
 * @param filename   The exact filename (basename with extension).
 * @returns A blob URL string suitable for `<img src=...>`.
 */
export async function getFilePreviewUrl(
  dirHandle: FileSystemDirectoryHandle,
  filename: string,
): Promise<string> {
  const fileHandle = await dirHandle.getFileHandle(filename)
  const file = await fileHandle.getFile()
  return URL.createObjectURL(file)
}

/**
 * Revoke a previously created blob URL to free browser memory.
 */
export function revokePreviewUrl(url: string): void {
  try {
    URL.revokeObjectURL(url)
  } catch {
    // Ignore errors from already-revoked or invalid URLs
  }
}

/**
 * Revoke an array of blob URLs. Convenience wrapper.
 */
export function revokeAllPreviewUrls(urls: string[]): void {
  for (const url of urls) {
    revokePreviewUrl(url)
  }
}

