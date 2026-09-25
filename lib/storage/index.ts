/**
 * Storage provider singleton.
 *
 * Import `storage` from this module wherever you need to upload, download,
 * or delete files. The underlying implementation is Google Drive, but
 * consumers never depend on that directly.
 */
export type { StorageProvider, UploadResult, UploadStatus } from './storage-provider'
export { GoogleDriveProvider, DriveAuthRequiredError } from './google-drive-provider'

import { GoogleDriveProvider } from './google-drive-provider'
import type { StorageProvider } from './storage-provider'

/** The global storage provider instance used by the application */
export const storage: StorageProvider = new GoogleDriveProvider()
