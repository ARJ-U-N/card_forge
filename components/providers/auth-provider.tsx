'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth'
import { getFirebaseAuth } from '@/lib/firebase/client'
import { isFirebaseConfigured } from '@/lib/firebase/config'
import {
  provisionUserAndWorkspace,
  subscribeToUser,
  subscribeToWorkspace,
} from '@/lib/firebase/repositories'
import {
  clearSessionCookie,
  setSessionCookie,
} from '@/lib/auth/session-cookie'
import type { User, Workspace } from '@/lib/models/types'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface AuthContextValue {
  status: AuthStatus
  firebaseUser: FirebaseUser | null
  user: User | null
  workspace: Workspace | null
  /** True while the user is signed in but Firestore docs are still loading. */
  isProfileLoading: boolean
  isConfigured: boolean
  signIn: (input: {
    email: string
    password: string
    remember: boolean
  }) => Promise<void>
  createAccount: (input: {
    email: string
    password: string
    fullName: string
    workspaceName: string
  }) => Promise<void>
  resetPassword: (email: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(
    isFirebaseConfigured ? 'loading' : 'unauthenticated',
  )
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [isProfileLoading, setIsProfileLoading] = useState(false)

  useEffect(() => {
    if (!isFirebaseConfigured) return
    const auth = getFirebaseAuth()
    return onAuthStateChanged(auth, (nextUser) => {
      setFirebaseUser(nextUser)
      if (nextUser) {
        setSessionCookie(true)
        setStatus('authenticated')
      } else {
        clearSessionCookie()
        setUser(null)
        setWorkspace(null)
        setStatus('unauthenticated')
      }
    })
  }, [])

  useEffect(() => {
    if (!firebaseUser) return
    setIsProfileLoading(true)
    const unsubscribe = subscribeToUser(
      firebaseUser.uid,
      (nextUser) => {
        setUser(nextUser)
        setIsProfileLoading(false)
      },
      (error) => {
        console.error('[auth] user subscription failed', error)
        setIsProfileLoading(false)
      },
    )
    return unsubscribe
  }, [firebaseUser])

  useEffect(() => {
    const workspaceId = user?.workspaceId
    if (!workspaceId) {
      setWorkspace(null)
      return
    }
    return subscribeToWorkspace(workspaceId, setWorkspace, (error) =>
      console.error('[auth] workspace subscription failed', error),
    )
  }, [user?.workspaceId])

  const signIn = useCallback<AuthContextValue['signIn']>(
    async ({ email, password, remember }) => {
      const auth = getFirebaseAuth()
      await setPersistence(
        auth,
        remember ? browserLocalPersistence : browserSessionPersistence,
      )
      await signInWithEmailAndPassword(auth, email, password)
      setSessionCookie(remember)
    },
    [],
  )

  const createAccount = useCallback<AuthContextValue['createAccount']>(
    async ({ email, password, fullName, workspaceName }) => {
      const auth = getFirebaseAuth()
      await setPersistence(auth, browserLocalPersistence)
      const credential = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      )
      await updateProfile(credential.user, { displayName: fullName })
      await provisionUserAndWorkspace({
        uid: credential.user.uid,
        email,
        displayName: fullName,
        workspaceName,
      })
      setSessionCookie(true)
    },
    [],
  )

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(getFirebaseAuth(), email)
  }, [])

  const signOut = useCallback(async () => {
    await firebaseSignOut(getFirebaseAuth())
    clearSessionCookie()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      firebaseUser,
      user,
      workspace,
      isProfileLoading,
      isConfigured: isFirebaseConfigured,
      signIn,
      createAccount,
      resetPassword,
      signOut,
    }),
    [
      status,
      firebaseUser,
      user,
      workspace,
      isProfileLoading,
      signIn,
      createAccount,
      resetPassword,
      signOut,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
