'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { PRIMARY_NAV } from '@/components/app/nav-config'

export function TourDialog({ trigger }: { trigger: React.ReactElement }) {
  const [step, setStep] = useState(0)
  const item = PRIMARY_NAV[step]
  const isLast = step === PRIMARY_NAV.length - 1

  return (
    <Dialog onOpenChange={(open) => !open && setStep(0)}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <item.icon className="size-5" aria-hidden="true" />
          </div>
          <DialogTitle>{item.title}</DialogTitle>
          <DialogDescription>{item.description}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {PRIMARY_NAV.map((nav, index) => (
            <span
              key={nav.href}
              className={
                index === step
                  ? 'h-1.5 w-6 rounded-full bg-primary'
                  : 'h-1.5 w-1.5 rounded-full bg-muted-foreground/30'
              }
            />
          ))}
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Back
          </Button>
          {isLast ? (
            <Button render={<Link href={item.href} />}>Open {item.title}</Button>
          ) : (
            <Button onClick={() => setStep((s) => s + 1)}>Next</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
