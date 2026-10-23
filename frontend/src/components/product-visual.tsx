import { Coffee, Headphones, Lamp, Package, Shirt, Wheat, type LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

const STYLES: Record<string, { icon: LucideIcon; gradient: string }> = {
  'coffee-tea': { icon: Coffee, gradient: 'from-amber-200 via-orange-100 to-rose-100 dark:from-amber-900/60 dark:via-orange-950/50 dark:to-rose-950/40' },
  fashion: { icon: Shirt, gradient: 'from-rose-200 via-fuchsia-100 to-violet-100 dark:from-rose-900/50 dark:via-fuchsia-950/50 dark:to-violet-950/40' },
  electronics: { icon: Headphones, gradient: 'from-sky-200 via-indigo-100 to-blue-100 dark:from-sky-900/50 dark:via-indigo-950/50 dark:to-blue-950/40' },
  'home-living': { icon: Lamp, gradient: 'from-emerald-200 via-teal-100 to-cyan-100 dark:from-emerald-900/50 dark:via-teal-950/50 dark:to-cyan-950/40' },
  pantry: { icon: Wheat, gradient: 'from-yellow-200 via-lime-100 to-amber-100 dark:from-yellow-900/50 dark:via-lime-950/40 dark:to-amber-950/40' },
}

/** Product artwork: the image when there is one, otherwise a category-tinted illustration. */
export function ProductVisual({
  categorySlug,
  imageUrl,
  name,
  className,
  iconClassName,
}: {
  categorySlug: string
  imageUrl?: string | null
  name: string
  className?: string
  iconClassName?: string
}) {
  if (imageUrl) {
    return <img src={imageUrl} alt={name} className={cn('object-cover', className)} loading="lazy" />
  }
  const { icon: Icon, gradient } = STYLES[categorySlug] ?? { icon: Package, gradient: 'from-muted to-accent' }
  return (
    <div
      role="img"
      aria-label={name}
      className={cn('relative grid place-items-center overflow-hidden bg-gradient-to-br', gradient, className)}
    >
      <div className="absolute -right-6 -top-6 size-28 rounded-full bg-white/40 blur-2xl dark:bg-white/5" />
      <div className="absolute -bottom-8 -left-8 size-32 rounded-full bg-white/30 blur-2xl dark:bg-white/5" />
      <Icon className={cn('relative size-14 text-foreground/70 drop-shadow-sm', iconClassName)} strokeWidth={1.25} />
    </div>
  )
}
