'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
} from 'react'
import { useAuth } from '@/components/providers/auth-provider'

/**
 * PortalProvider stores the portal token in sessionStorage so that:
 * - We know the user entered via a portal (for sign-out redirect)
 * - We can derive isPortalUser from the Firestore user role
 * - We expose the portalFolderId for folder scoping
 *
 * The actual authentication is handled by Firebase Auth (custom token).
 * The PortalProvider is a thin convenience layer on top of AuthProvider.
 */

const PORTAL_TOKEN_KEY = 'cf_portal_token'
const PORTAL_FOLDER_NAME_KEY = 'cf_portal_folder_name'

interface PortalContextValue {
  /** True if the signed-in user has role 'portal'. */
  isPortalUser: boolean
  /** The main College folder this portal user is restricted to. */
  portalFolderId: string | null
  /** The College/folder name for display. */
  portalFolderName: string | null
  /** The portal token (for sign-out redirect URL). */
  portalToken: string | null
  /** Store portal session metadata (called after successful portal auth). */
  setPortalSession: (token: string, folderName: string) => void
  /** Clear portal session metadata and sign out. */
  clearPortalSession: () => void
}

const PortalContext = createContext<PortalContextValue | null>(null)

export function PortalProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()

  const isPortalUser = user?.role === 'portal'
  const portalFolderId = user?.portalFolderId ?? null

  // Read from sessionStorage (SSR-safe)
  const portalToken =
    typeof window !== 'undefined'
      ? sessionStorage.getItem(PORTAL_TOKEN_KEY)
      : null
  const portalFolderName =
    typeof window !== 'undefined'
      ? sessionStorage.getItem(PORTAL_FOLDER_NAME_KEY)
      : null

  const setPortalSession = useCallback(
    (token: string, folderName: string) => {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(PORTAL_TOKEN_KEY, token)
        sessionStorage.setItem(PORTAL_FOLDER_NAME_KEY, folderName)
      }
    },
    [],
  )

  const clearPortalSession = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(PORTAL_TOKEN_KEY)
      sessionStorage.removeItem(PORTAL_FOLDER_NAME_KEY)
    }
  }, [])

  const value = useMemo<PortalContextValue>(
    () => ({
      isPortalUser,
      portalFolderId,
      portalFolderName,
      portalToken,
      setPortalSession,
      clearPortalSession,
    }),
    [
      isPortalUser,
      portalFolderId,
      portalFolderName,
      portalToken,
      setPortalSession,
      clearPortalSession,
    ],
  )

  return (
    <PortalContext.Provider value={value}>{children}</PortalContext.Provider>
  )
}

export function usePortal(): PortalContextValue {
  const ctx = useContext(PortalContext)
  if (!ctx) throw new Error('usePortal must be used inside <PortalProvider>')
  return ctx
}
