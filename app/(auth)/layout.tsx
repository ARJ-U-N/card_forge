import { Suspense } from 'react'
import Link from 'next/link'
import { AuthBrandPanel } from '@/components/auth/auth-brand-panel'
import { AuthRedirect } from '@/components/auth/auth-redirect'
import { BrandMark } from '@/components/brand-mark'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <Suspense>
        <AuthRedirect />
      </Suspense>
      <AuthBrandPanel />
      <main className="flex flex-col bg-background">
        <header className="flex items-center justify-between px-6 py-5 lg:hidden">
          <Link href="/sign-in" className="flex items-center gap-2">
            <BrandMark className="size-8" />
            <span className="font-semibold tracking-tight">CardForge</span>
          </Link>
        </header>
        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-2 px-6 py-5 text-xs text-muted-foreground sm:px-10">
          <span>&copy; {new Date().getFullYear()} CardForge</span>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy Policy
          </Link>
        </footer>
      </main>
    </div>
  )
}
