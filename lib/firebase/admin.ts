/**
 * Firebase Admin SDK singleton for server-side Firestore access.
 *
 * This module initialises firebase-admin ONCE per Node process.
 * It is used exclusively by server-side code (Next.js API routes)
 * to read/write protected Firestore documents (e.g. system/driveCredentials)
 * that are intentionally denied to normal client users by security rules.
 *
 * The Admin SDK bypasses Firestore security rules by design,
 * which is exactly what we need for storing sensitive OAuth tokens.
 *
 * Authentication:
 *   Set GOOGLE_APPLICATION_CREDENTIALS to the absolute path of a
 *   Firebase service-account JSON file. The Admin SDK reads this
 *   automatically via Application Default Credentials (ADC).
 *
 * IMPORTANT:
 *   - This file must NEVER be imported from client-side code.
 *   - The service account here is only for Firestore admin access.
 *   - Google Drive operations continue to use the print shop owner's
 *     personal OAuth tokens — the service account is NOT used for Drive.
 */

import {
  type App,
  applicationDefault,
  getApp,
  getApps,
  initializeApp,
} from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

function initAdmin(): App {
  // Already initialised?
  if (getApps().length > 0) {
    return getApp()
  }

  // Uses GOOGLE_APPLICATION_CREDENTIALS env var automatically (ADC).
  return initializeApp({
    credential: applicationDefault(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  })
}

let _admin: App | null = null

export function getAdminApp(): App {
  if (!_admin) {
    _admin = initAdmin()
  }
  return _admin
}

export function getAdminFirestore(): Firestore {
  return getFirestore(getAdminApp())
}
