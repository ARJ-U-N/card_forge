/**
 * A lightweight, non-sensitive presence flag that lets the Next.js proxy
 * redirect signed-out visitors before the page renders. It carries no
 * credentials. Real authorization is enforced by Firebase Auth on the client
 * and by Firestore security rules on the server.
 */
export const SESSION_COOKIE = 'cf_session'

export function setSessionCookie(remember: boolean) {
  if (typeof document === 'undefined') return
  const maxAge = remember ? `; Max-Age=${60 * 60 * 24 * 30}` : ''
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${SESSION_COOKIE}=1; Path=/; SameSite=Lax${maxAge}${secure}`
}

export function clearSessionCookie() {
  if (typeof document === 'undefined') return
  document.cookie = `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
}
