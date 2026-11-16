/**
 * "For you": what a visitor seems interested in, worked out from their own recent actions on this device only
 * (docs/HOME_FOR_YOU_AND_CATEGORIES_PLAN.md, section 5). Nothing here talks to the server.
 *
 * Pure functions, no imports, so they can be tested with plain Node (src/lib/interests-core.test.ts).
 */

export type ActionKind = 'save' | 'view' | 'category' | 'search'

export type Action = {
  kind: ActionKind
  /** category slug (and its name, to show "Because you looked at Laptops") */
  category?: string
  categoryName?: string
  /** brand from the listing's details, when it has one */
  brand?: string
  /** search words */
  term?: string
  /** the listing, for "Recently viewed" */
  productSlug?: string
  at: number
}

export const WEIGHTS: Record<ActionKind, number> = { save: 5, view: 3, category: 2, search: 2 }
export const MAX_ACTIONS = 50
const DAY = 86_400_000
export const HALF_LIFE = 7 * DAY
export const MAX_AGE = 30 * DAY

/** Never used for suggestions, so a shared phone doesn't show someone's health searches on the home page. */
const PRIVATE = /medic|pharma|pregnan|condom|contracep/i

export function isPrivate(a: Pick<Action, 'category' | 'categoryName' | 'term'>): boolean {
  return [a.category, a.categoryName, a.term].some((v) => !!v && PRIVATE.test(v))
}

const clean = (s: string | undefined) => (s ?? '').trim().replace(/\s+/g, ' ')

/** Adds one action: private ones and digits-only searches are dropped, old ones expire, the newest 50 are kept. */
export function addAction(list: Action[], action: Action, now = Date.now()): Action[] {
  const a: Action = { ...action, term: clean(action.term) || undefined, brand: clean(action.brand) || undefined }
  if (isPrivate(a)) return prune(list, now)
  if (a.kind === 'search' && (!a.term || /^[\d\s+()-]*$/.test(a.term) || a.term.length > 60)) return prune(list, now)
  if (a.kind !== 'search' && !a.category) return prune(list, now)
  // the same thing twice within 10 seconds (a menu link, then the page it opens) counts once
  const last = list[list.length - 1]
  if (last && last.kind === a.kind && last.category === a.category && (last.term ?? '').toLowerCase() === (a.term ?? '').toLowerCase()
    && last.productSlug === a.productSlug && Math.abs(a.at - last.at) < 10_000) return prune(list, now)
  return prune([...list, a], now)
}

export function prune(list: Action[], now = Date.now()): Action[] {
  return list
    .filter((a) => a && typeof a.at === 'number' && now - a.at <= MAX_AGE && a.at <= now + DAY)
    .sort((x, y) => x.at - y.at)
    .slice(-MAX_ACTIONS)
}

/** An action's weight today: full when new, half after 7 days, a quarter after 14. */
export function weight(a: Action, now = Date.now()): number {
  return WEIGHTS[a.kind] * Math.pow(0.5, Math.max(0, now - a.at) / HALF_LIFE)
}

export type Interests = {
  categories: { slug: string; name: string; score: number }[]
  brands: { name: string; score: number }[]
  /** newest first, no repeats (case ignored) */
  searches: string[]
  /** listing slugs, newest first, no repeats */
  viewed: string[]
}

/** Totals per category and brand, highest first; recent searches and recently viewed listings, newest first. */
export function interests(list: Action[], now = Date.now()): Interests {
  const live = prune(list, now)
  const cats = new Map<string, { slug: string; name: string; score: number }>()
  const brands = new Map<string, { name: string; score: number }>()
  for (const a of live) {
    const w = weight(a, now)
    if (a.category) {
      const c = cats.get(a.category) ?? { slug: a.category, name: a.categoryName || a.category, score: 0 }
      c.score += w
      if (a.categoryName) c.name = a.categoryName
      cats.set(a.category, c)
    }
    if (a.brand) {
      const key = a.brand.toLowerCase()
      const b = brands.get(key) ?? { name: a.brand, score: 0 }
      b.score += w
      brands.set(key, b)
    }
  }
  const newest = [...live].reverse()
  const distinct = (values: (string | undefined)[]) => {
    const seen = new Set<string>()
    return values.filter((v): v is string => {
      if (!v || seen.has(v.toLowerCase())) return false
      seen.add(v.toLowerCase())
      return true
    })
  }
  const byScore = <T extends { score: number }>(xs: T[]) => xs.sort((x, y) => y.score - x.score)
  return {
    categories: byScore([...cats.values()]),
    brands: byScore([...brands.values()]),
    searches: distinct(newest.filter((a) => a.kind === 'search').map((a) => a.term)).slice(0, 6),
    viewed: distinct(newest.filter((a) => a.kind === 'view' || a.kind === 'save').map((a) => a.productSlug)).slice(0, 8),
  }
}

export type Row =
  | { kind: 'category'; slug: string; name: string }
  | { kind: 'brand'; name: string }
  | { kind: 'search'; term: string }

/**
 * Up to 3 "Picked for you" rows: the top 2 categories, then a brand that stands out (seen at least twice, i.e. a
 * score of 5 or more), else the latest search. A brand or search already covered by a row's name is skipped.
 */
export function rowsFor(i: Interests, max = 3): Row[] {
  const rows: Row[] = i.categories.slice(0, 2).map((c) => ({ kind: 'category', slug: c.slug, name: c.name }))
  const brand = i.brands.find((b) => b.score >= 5)
  if (brand) rows.push({ kind: 'brand', name: brand.name })
  const covered = rows.map((r) => (r.kind === 'search' ? r.term : r.name).toLowerCase())
  for (const term of i.searches) {
    if (rows.length >= max) break
    if (!covered.some((c) => c.includes(term.toLowerCase()) || term.toLowerCase().includes(c))) rows.push({ kind: 'search', term })
  }
  return rows.slice(0, max)
}
