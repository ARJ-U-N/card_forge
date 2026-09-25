/**
 * Google Drive storage provider.
 *
 * This runs in the browser and delegates all Drive operations to
 * server-side Next.js API routes so that OAuth tokens and client secrets
 * are never exposed to the client.
 */
import type { StorageProvider, UploadResult } from './storage-provider'

const MAX_RETRIES = 3
const RETRY_BASE_MS = 500

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = MAX_RETRIES,
): Promise<Response> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, init)
      // Don't retry client errors (4xx) except 429 (rate limit)
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
        return res
      }
      lastError = new Error(`HTTP ${res.status}: ${res.statusText}`)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }

    if (attempt < retries - 1) {
      await new Promise((r) => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt)))
    }
  }

  throw lastError ?? new Error('Upload failed after retries')
}

export class GoogleDriveProvider implements StorageProvider {
  async upload(workspaceId: string, file: File, path: string): Promise<UploadResult> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('workspaceId', workspaceId)
    formData.append('path', path)

    const res = await fetchWithRetry('/api/drive/upload', {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const code = (body as Record<string, unknown>).code
      if (code === 'DRIVE_AUTH_REQUIRED') {
        throw new DriveAuthRequiredError('Google Drive is not connected. An administrator must authorize Drive access.')
      }
      throw new Error((body as Record<string, unknown>).error as string || `Upload failed (${res.status})`)
    }

    return (await res.json()) as UploadResult
  }

  getFileUrl(fileId: string): string {
    if (!fileId) return ''
    // Same-origin API route — no CORS issues for canvas/img
    return `/api/drive/download/${encodeURIComponent(fileId)}`
  }

  async delete(fileId: string): Promise<void> {
    if (!fileId) return

    const res = await fetchWithRetry('/api/drive/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error((body as Record<string, unknown>).error as string || `Delete failed (${res.status})`)
    }
  }

  async createFolder(workspaceId: string, name: string, parentId?: string): Promise<string> {
    const res = await fetchWithRetry('/api/drive/folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, name, parentId }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error((body as Record<string, unknown>).error as string || `Folder creation failed (${res.status})`)
    }

    const data = (await res.json()) as { folderId: string }
    return data.folderId
  }
}

/**
 * Thrown when the owner's Google Drive authorization is missing or expired.
 * The UI should prompt the owner to reconnect.
 */
export class DriveAuthRequiredError extends Error {
  readonly code = 'DRIVE_AUTH_REQUIRED'
  constructor(message: string) {
    super(message)
    this.name = 'DriveAuthRequiredError'
  }
}
