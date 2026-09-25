import { redirect } from 'next/navigation'

// The proxy normally handles "/", this is a fallback for environments without it.
export default function RootPage() {
  redirect('/dashboard')
}
