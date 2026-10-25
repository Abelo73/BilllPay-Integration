import { Link } from 'react-router'

import { cn } from '@/lib/utils'

/**
 * The Sodo Gebeya symbol from the brand kit: an S in a map pin with the amber "deal" dot.
 * Green pin on light backgrounds; white pin (green S) on dark ones (`onDark`, or the dark theme).
 */
export function LogoSymbol({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <svg viewBox="12 4 76 96" aria-hidden className={cn('shrink-0', className)}>
      <path
        d="M50 97 C50 97 16 64 16 44 A34 34 0 0 1 84 44 C84 64 50 97 50 97 Z"
        className={onDark ? 'fill-white' : 'fill-[#0E5A43] dark:fill-white'}
      />
      <path
        d="M61 33 C61 26 39 25 39 36 C39 46 61 44 61 55 C61 66 39 66 39 58"
        transform="translate(0,-2)"
        fill="none"
        strokeWidth="9"
        strokeLinecap="round"
        className={onDark ? 'stroke-[#0E5A43]' : 'stroke-white dark:stroke-[#0E5A43]'}
      />
      <circle cx="72" cy="18" r="7.5" fill="#E39B2D" />
    </svg>
  )
}

/** Square brand mark for small places (admin sidebar, sign-in). */
export function LogoMark({ className }: { className?: string }) {
  return <LogoSymbol className={cn('h-8 w-auto', className)} />
}

/** The full horizontal logo (symbol, "Sodo Gebeya", ሶዶ ገበያ) from the brand kit; swaps to the on-green version in the dark theme. */
export function Logo({ className, onDark = false }: { withPlace?: boolean; className?: string; onDark?: boolean }) {
  return (
    <Link to="/" aria-label="Sodo Gebeya, home" className={cn('flex shrink-0 items-center', className)}>
      {onDark ? (
        <img src="/brand/logo-horizontal-dark.svg" alt="Sodo Gebeya" className="h-10 w-auto" width={167} height={40} />
      ) : (
        <>
          <img src="/brand/logo-horizontal-color.svg" alt="Sodo Gebeya" className="h-10 w-auto dark:hidden" width={167} height={40} />
          <img src="/brand/logo-horizontal-dark.svg" alt="Sodo Gebeya" className="hidden h-10 w-auto dark:block" width={167} height={40} />
        </>
      )}
    </Link>
  )
}
