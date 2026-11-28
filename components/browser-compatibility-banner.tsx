'use client'

import { useEffect, useState } from 'react'

/**
 * Browser compatibility warning banner.
 *
 * Uses feature detection (not user-agent strings) to check for
 * File System Access API support (showDirectoryPicker). This API
 * is required for CardForge's batched PDF export workflow.
 *
 * Shows a dismissible warning banner on unsupported browsers.
 * Does NOT block access — per user requirement, it serves as
 * a warning popup/banner, not a hard block.
 */
export function BrowserCompatibilityBanner() {
  const [isUnsupported, setIsUnsupported] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Feature detection: check for File System Access API
    const hasFileSystemAccess =
      typeof window !== 'undefined' &&
      'showDirectoryPicker' in window &&
      typeof (window as any).showDirectoryPicker === 'function'

    if (!hasFileSystemAccess) {
      setIsUnsupported(true)
    }
  }, [])

  if (!isUnsupported || dismissed) return null

  return (
    <div className="fixed inset-x-0 top-0 z-[9999] flex items-center justify-center bg-amber-500/95 px-4 py-3 text-sm text-white shadow-lg backdrop-blur-sm">
      <div className="flex max-w-3xl items-center gap-3">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="size-5 shrink-0"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
        <p>
          <strong>Your browser is not fully supported.</strong>{' '}
          CardForge requires a Chromium-based browser for bulk PDF export.
          Please use the latest version of{' '}
          <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong>{' '}
          for the best experience.
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="ml-2 shrink-0 rounded-md p-1 hover:bg-white/20 transition-colors"
          aria-label="Dismiss"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="size-4"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
