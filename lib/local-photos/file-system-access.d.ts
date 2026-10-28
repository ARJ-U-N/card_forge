/**
 * Type augmentations for the File System Access API.
 *
 * TypeScript's DOM lib (as of 5.7) includes FileSystemDirectoryHandle and
 * FileSystemFileHandle but does not declare window.showDirectoryPicker()
 * or handle.queryPermission() / handle.requestPermission() because those
 * APIs are not yet W3C Recommendations.
 *
 * These declarations cover only the surface this feature uses.
 */

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite'
}

interface FileSystemHandle {
  queryPermission?(
    descriptor?: FileSystemHandlePermissionDescriptor,
  ): Promise<PermissionState>
  requestPermission?(
    descriptor?: FileSystemHandlePermissionDescriptor,
  ): Promise<PermissionState>
}

interface Window {
  showDirectoryPicker?(options?: {
    id?: string
    mode?: 'read' | 'readwrite'
    startIn?:
      | FileSystemHandle
      | 'desktop'
      | 'documents'
      | 'downloads'
      | 'music'
      | 'pictures'
      | 'videos'
  }): Promise<FileSystemDirectoryHandle>
}

interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<
    [string, FileSystemDirectoryHandle | FileSystemFileHandle]
  >
  keys(): AsyncIterableIterator<string>
  values(): AsyncIterableIterator<
    FileSystemDirectoryHandle | FileSystemFileHandle
  >
}

