import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'

export function AppShellSkeleton() {
  return (
    <div
      className="flex min-h-svh"
      role="status"
      aria-live="polite"
      aria-label="Loading your workspace"
    >
      <div className="hidden w-64 flex-col gap-6 bg-sidebar p-4 md:flex">
        <Skeleton className="h-9 w-full bg-sidebar-accent" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full bg-sidebar-accent" />
          ))}
        </div>
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex h-14 items-center border-b px-6">
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <Spinner className="size-6" />
          <p className="text-sm">Checking your session…</p>
        </div>
      </div>
    </div>
  )
}
