import Image from 'next/image'
import { BadgeCheckIcon, LockKeyholeIcon, LayersIcon } from 'lucide-react'
import { BrandMark } from '@/components/brand-mark'

const VALUE_POINTS = [
  {
    icon: LayersIcon,
    title: 'Design once, issue thousands',
    body: 'Drag-and-drop card templates with dynamic fields, QR codes and barcodes.',
  },
  {
    icon: BadgeCheckIcon,
    title: 'Verified member records',
    body: 'Import spreadsheets, keep departments organized, and track every issued card.',
  },
  {
    icon: LockKeyholeIcon,
    title: 'Workspace-isolated by default',
    body: 'Every record is scoped to your organization and protected by strict access rules.',
  },
]

export function AuthBrandPanel() {
  return (
    <aside className="relative hidden flex-col justify-between overflow-hidden bg-brand p-10 text-brand-foreground lg:flex xl:p-14">
      <div className="flex items-center gap-3">
        <BrandMark className="size-9" />
        <span className="text-lg font-semibold tracking-tight">CardForge</span>
      </div>

      <div className="flex flex-col gap-10">
        <div className="flex flex-col gap-4">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-brand-foreground/60">
            Identity card management
          </p>
          <h1 className="max-w-md text-balance text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">
            Professional ID cards, from spreadsheet to print.
          </h1>
        </div>

        <div className="relative aspect-[16/10] w-full max-w-xl overflow-hidden rounded-xl border border-brand-foreground/10">
          <Image
            src="/images/id-cards-hero.png"
            alt="Preview of employee ID card templates generated with CardForge"
            fill
            priority
            sizes="(min-width: 1024px) 45vw, 0px"
            className="object-cover"
          />
        </div>

        <ul className="flex flex-col gap-5">
          {VALUE_POINTS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex items-start gap-4">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-highlight text-highlight-foreground">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <div className="flex flex-col gap-1">
                <p className="font-medium">{title}</p>
                <p className="text-sm leading-relaxed text-brand-foreground/70">
                  {body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-brand-foreground/50">
        Trusted for schools, offices, events and membership programs.
      </p>
    </aside>
  )
}
