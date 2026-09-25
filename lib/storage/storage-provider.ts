/**
 * Storage provider abstraction.
 * 
 * Application code calls these methods without knowing whether the backend
 * is Firebase Storage, Google Drive, or anything else.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UploadStatus = 'pending' | 'uploaded' | 'failed'

export interface UploadResult {
  /** Stable identifier for the file in the storage backend */
  fileId: string
  /** URL that can be used in <img src> / Image().src to display the file */
  url: string
  /** MIME type */
  mimeType: string
  /** Original filename */
  filename: string
}

export interface StorageProvider {
  /**
   * Upload a file.
   * @param workspaceId  Workspace that owns the file
   * @param file         The file to upload
   * @param path         Logical path within the workspace, e.g. "members/profiles"
   * @returns            Stable file reference
   */
  upload(workspaceId: string, file: File, path: string): Promise<UploadResult>

  /**
   * Get a URL that the browser can use to display/load the file.
   * For same-origin proxied storage this is a relative path like
   * "/api/drive/download/FILE_ID".
   */
  getFileUrl(fileId: string): string

  /**
   * Delete a file from storage.
   * @param fileId  The storage backend file identifier
   */
  delete(fileId: string): Promise<void>

  /**
   * Create a folder in the storage backend.
   * @param workspaceId  Workspace that owns the folder
   * @param name         Folder name
   * @param parentId     Optional parent folder ID in the storage backend
   * @returns            The folder ID in the storage backend
   */
  createFolder(workspaceId: string, name: string, parentId?: string): Promise<string>
}
