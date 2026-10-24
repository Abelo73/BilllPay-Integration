import { BadgeCheck } from 'lucide-react'

import { cn } from '@/lib/utils'

/** Shown next to sellers whose ID Sodo Gebeya checked. */
export function VerifiedBadge({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary', className)}
      title="Sodo Gebeya checked this seller's ID"
    >
      <BadgeCheck className="size-3.5" aria-hidden />
      {compact ? <span className="sr-only">Verified</span> : 'Verified'}
    </span>
  )
}
