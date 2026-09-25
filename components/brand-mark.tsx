import { cn } from '@/lib/utils'

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-highlight text-highlight-foreground',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-[60%]">
        <rect
          x="3"
          y="5"
          width="18"
          height="14"
          rx="2"
          stroke="currentColor"
          strokeWidth="2"
        />
        <rect x="6" y="9" width="5" height="6" rx="1" fill="currentColor" />
        <path
          d="M13 10h5M13 13h5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}
