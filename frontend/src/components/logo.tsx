import { Store } from 'lucide-react'
import { Link } from 'react-router'

import { cn } from '@/lib/utils'

/** The brand mark that every icon-sized use shares (header, admin, sign-in). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm', className)}>
      <Store className="size-4" />
    </span>
  )
}

/** Sodo Gebeya wordmark; `withPlace` adds "Wolaita Sodo · ሶዶ ገበያ" under it. */
export function Logo({ withPlace = false, className }: { withPlace?: boolean; className?: string }) {
  return (
    <Link to="/" aria-label="Sodo Gebeya, home" className={cn('flex items-center gap-2', className)}>
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className="text-lg font-extrabold tracking-tight">
          Sodo <span className="text-brand">Gebeya</span>
        </span>
        {withPlace && (
          <span className="mt-1 text-[11px] font-medium text-muted-foreground">
            Wolaita Sodo · <span className="font-ethiopic">ሶዶ ገበያ</span>
          </span>
        )}
      </span>
    </Link>
  )
}
