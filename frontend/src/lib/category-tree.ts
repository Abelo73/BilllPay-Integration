import { useQuery } from '@tanstack/react-query'
import {
  Armchair,
  Baby,
  BookOpen,
  Car,
  Coffee,
  CookingPot,
  Dumbbell,
  Footprints,
  Gift,
  HardHat,
  Home,
  Laptop,
  type LucideIcon,
  Music,
  PawPrint,
  Shirt,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Sprout,
  Sun,
  Tag,
  Wheat,
  Wrench,
} from 'lucide-react'

import { api, type Category } from '@/lib/api'

/** /api/categories also sends how many listings the store shows (a main category counts its sub-categories'). */
export type CountedCategory = Category & { listingCount?: number | null }

export type MainCategory = CountedCategory & { children: CountedCategory[] }

/**
 * Icon and colour per main category, matched by slug keyword. Categories are managed in the admin, so an unknown
 * one still gets the shopping bag and the shop's green.
 */
const LOOKS: { match: RegExp; icon: LucideIcon; tint: string }[] = [
  { match: /electronic|gadget/, icon: Laptop, tint: 'from-sky-500/15 to-sky-500/5 text-sky-700 dark:text-sky-300' },
  { match: /phone|tablet/, icon: Smartphone, tint: 'from-sky-500/15 to-sky-500/5 text-sky-700 dark:text-sky-300' },
  { match: /fashion|cloth|dress|wear/, icon: Shirt, tint: 'from-rose-500/15 to-rose-500/5 text-rose-700 dark:text-rose-300' },
  { match: /shoe|sandal|boot/, icon: Footprints, tint: 'from-rose-500/15 to-rose-500/5 text-rose-700 dark:text-rose-300' },
  { match: /home|living|furniture|sofa/, icon: Armchair, tint: 'from-amber-500/20 to-amber-500/5 text-amber-800 dark:text-amber-300' },
  { match: /kitchen|cook/, icon: CookingPot, tint: 'from-amber-500/20 to-amber-500/5 text-amber-800 dark:text-amber-300' },
  { match: /propert|house|land/, icon: Home, tint: 'from-indigo-500/15 to-indigo-500/5 text-indigo-700 dark:text-indigo-300' },
  { match: /vehicle|car|motor|bajaj|bike/, icon: Car, tint: 'from-slate-500/15 to-slate-500/5 text-slate-700 dark:text-slate-300' },
  { match: /agricult|farm|seed/, icon: Sprout, tint: 'from-lime-500/20 to-lime-500/5 text-lime-800 dark:text-lime-300' },
  { match: /animal|livestock|pet/, icon: PawPrint, tint: 'from-orange-500/15 to-orange-500/5 text-orange-700 dark:text-orange-300' },
  { match: /build|construct|cement/, icon: HardHat, tint: 'from-yellow-500/20 to-yellow-500/5 text-yellow-800 dark:text-yellow-300' },
  { match: /tool|equipment|machine/, icon: Wrench, tint: 'from-zinc-500/15 to-zinc-500/5 text-zinc-700 dark:text-zinc-300' },
  { match: /solar|power|energy/, icon: Sun, tint: 'from-amber-400/25 to-amber-400/5 text-amber-700 dark:text-amber-300' },
  { match: /tradition|cultur|habesha/, icon: Sparkles, tint: 'from-emerald-500/15 to-emerald-500/5 text-emerald-700 dark:text-emerald-300' },
  { match: /music|instrument/, icon: Music, tint: 'from-violet-500/15 to-violet-500/5 text-violet-700 dark:text-violet-300' },
  { match: /gift|event|wedding/, icon: Gift, tint: 'from-pink-500/15 to-pink-500/5 text-pink-700 dark:text-pink-300' },
  { match: /beauty|health|cosmetic/, icon: Sparkles, tint: 'from-fuchsia-500/15 to-fuchsia-500/5 text-fuchsia-700 dark:text-fuchsia-300' },
  { match: /baby|kid|toy/, icon: Baby, tint: 'from-cyan-500/15 to-cyan-500/5 text-cyan-700 dark:text-cyan-300' },
  { match: /sport|outdoor|fitness/, icon: Dumbbell, tint: 'from-teal-500/15 to-teal-500/5 text-teal-700 dark:text-teal-300' },
  { match: /book|station|school/, icon: BookOpen, tint: 'from-blue-500/15 to-blue-500/5 text-blue-700 dark:text-blue-300' },
  { match: /coffee|tea/, icon: Coffee, tint: 'from-amber-700/15 to-amber-700/5 text-amber-900 dark:text-amber-200' },
  { match: /pantry|food|grain|spice/, icon: Wheat, tint: 'from-yellow-600/15 to-yellow-600/5 text-yellow-900 dark:text-yellow-200' },
  { match: /used|second/, icon: Tag, tint: 'from-primary/15 to-primary/5 text-primary' },
]

export function categoryLook(slug: string): { icon: LucideIcon; tint: string } {
  return LOOKS.find((l) => l.match.test(slug)) ?? { icon: ShoppingBag, tint: 'from-primary/15 to-primary/5 text-primary' }
}

/** Main categories in the admin's order, each with its sub-categories (also in order). */
export function buildTree(flat: CountedCategory[]): MainCategory[] {
  const mains = flat.filter((c) => c.parentId == null).map((c) => ({ ...c, children: [] as CountedCategory[] }))
  const byId = new Map(mains.map((m) => [m.id, m]))
  for (const c of flat) {
    if (c.parentId != null) byId.get(c.parentId)?.children.push(c)
  }
  return mains
}

/** Sub-categories with the most listings first, for the "3 chips" on a card. */
export function topChildren(main: MainCategory, n: number): CountedCategory[] {
  return [...main.children].sort((a, b) => (b.listingCount ?? 0) - (a.listingCount ?? 0)).slice(0, n)
}

/** Same cache key as the rest of the shop ('categories'), so one request serves every page. */
export function useCategoryTree() {
  const q = useQuery({ queryKey: ['categories'], queryFn: api.categories, staleTime: 5 * 60_000 })
  const flat = (q.data ?? []) as CountedCategory[]
  return { ...q, flat, tree: buildTree(flat) }
}

/** "1 listing" / "64 listings" without the translation helper (callers pass t). */
export function countLabel(n: number | null | undefined, t: (s: string, v?: Record<string, string | number>) => string) {
  const count = n ?? 0
  return count === 1 ? t('1 listing') : t('{n} listings', { n: count.toLocaleString() })
}
