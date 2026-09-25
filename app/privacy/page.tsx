import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeftIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BrandMark } from '@/components/brand-mark'

export const metadata: Metadata = { title: 'Privacy Policy' }

const SECTIONS = [
  {
    title: 'What we store',
    body: 'Your account email, display name, and the workspace records you create (templates, member data, generated cards). Passwords are handled by Firebase Authentication and are never stored in our database.',
  },
  {
    title: 'Workspace isolation',
    body: 'All data belongs to a workspace. Only members of that workspace can read or modify its records, enforced by server-side security rules.',
  },
  {
    title: 'Your rights',
    body: 'You can update your profile at any time and request deletion of your workspace and all associated data by contacting your administrator.',
  },
]

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-10 px-6 py-12">
      <div className="flex items-center gap-3">
        <BrandMark className="size-8" />
        <span className="font-semibold tracking-tight">CardForge</span>
      </div>
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">
          Last updated {new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}
        </p>
      </div>
      <div className="flex flex-col gap-8">
        {SECTIONS.map((section) => (
          <section key={section.title} className="flex flex-col gap-2">
            <h2 className="text-lg font-medium">{section.title}</h2>
            <p className="leading-relaxed text-muted-foreground">{section.body}</p>
          </section>
        ))}
      </div>
      <Button variant="outline" className="self-start" render={<Link href="/sign-in" />}>
        <ArrowLeftIcon data-icon="inline-start" />
        Back to sign in
      </Button>
    </main>
  )
}
