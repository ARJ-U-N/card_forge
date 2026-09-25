import { FirebaseError } from 'firebase/app'

const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/user-not-found': 'Incorrect email or password.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/user-disabled': 'This account has been disabled. Contact your administrator.',
  'auth/too-many-requests':
    'Too many attempts. Please wait a moment or reset your password.',
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/weak-password': 'Choose a stronger password (at least 8 characters).',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
  'auth/operation-not-allowed':
    'Email/password sign-in is not enabled for this Firebase project.',
  'auth/configuration-not-found':
    'Firebase Authentication is not set up for this project yet.',
  'permission-denied':
    'Your account is missing a workspace record. Contact support.',
}

export function getAuthErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    return MESSAGES[error.code] ?? `Something went wrong (${error.code}).`
  }
  if (error instanceof Error && error.message) return error.message
  return 'Something went wrong. Please try again.'
}

export function isInvalidCredentialError(error: unknown): boolean {
  return (
    error instanceof FirebaseError &&
    [
      'auth/invalid-credential',
      'auth/wrong-password',
      'auth/user-not-found',
    ].includes(error.code)
  )
}
