import { ArrowRight, ChevronDown, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'

import { Skeleton } from '@/components/ui/skeleton'
import { categoryLook, countLabel, type MainCategory, useCategoryTree } from '@/lib/category-tree'
import { useT } from '@/lib/i18n'
import { recordInterest } from '@/lib/interests'
import { cn } from '@/lib/utils'

/** Every main category with its sub-categories and listing counts, and a box to find one by name. */
export function CategoriesPage() {
  const t = useT()
  const { tree, isLoading } = useCategoryTree()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<number | null>(null)

  const q = query.trim().toLowerCase()
  // a main category matches by its name or by any sub-category's; while searching, the matching ones open
  const shown = useMemo(
    () =>
      tree
        .map((m) => {
          if (!q || t(m.name).toLowerCase().includes(q) || m.name.toLowerCase().includes(q)) return { main: m, subs: m.children }
          const subs = m.children.filter((c) => c.name.toLowerCase().includes(q) || t(c.name).toLowerCase().includes(q))
          return subs.length ? { main: m, subs } : null
        })
        .filter((x): x is { main: MainCategory; subs: MainCategory['children'] } => x !== null),
    [tree, q, t],
  )

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 sm:py-12">
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{t('Everything in Sodo')}</p>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t('All categories')}</h1>
        <p className="text-muted-foreground">{t('Pick a category, or type what you are looking for.')}</p>
      </div>

      <label className="flex h-12 max-w-xl items-center gap-2 rounded-2xl border bg-card px-4 shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/30">
        <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="sr-only">{t('Find a category')}</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('Find a category: sofa, cement, goats…')}
          className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label={t('Clear')} className="grid size-8 place-items-center rounded-full hover:bg-muted">
            <X className="size-4" />
          </button>
        )}
      </label>

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-3xl" />)}
        </div>
      )}
      {!isLoading && shown.length === 0 && (
        <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
          {t('No category matches "{q}".', { q: query.trim() })}{' '}
          <Link to={`/shop?q=${encodeURIComponent(query.trim())}`} className="font-semibold text-primary hover:underline">
            {t('Search listings for it instead')}
          </Link>
        </p>
      )}

      <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map(({ main, subs }) => {
          const { icon: Icon, tint } = categoryLook(main.slug)
          const expanded = !!q || open === main.id
          return (
            <section key={main.id} className="overflow-hidden rounded-3xl border bg-card transition hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
              <div className="flex items-center gap-3 p-4">
                <span className={cn('grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br', tint)}>
                  <Icon className="size-6" />
                </span>
                <Link
                  to={`/shop?category=${main.slug}`}
                  onClick={() => recordInterest({ kind: 'category', category: main.slug, categoryName: main.name })}
                  className="min-w-0 flex-1"
                >
                  <span className="block truncate font-bold hover:text-primary">{t(main.name)}</span>
                  <span className="block text-xs text-muted-foreground">{countLabel(main.listingCount, t)}</span>
                </Link>
                {main.children.length > 0 && !q && (
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : main.id)}
                    aria-expanded={expanded}
                    aria-label={expanded ? t('Hide sub-categories') : t('Show sub-categories')}
                    className="grid size-10 place-items-center rounded-full hover:bg-muted"
                  >
                    <ChevronDown className={cn('size-5 transition', expanded && 'rotate-180')} />
                  </button>
                )}
              </div>
              {expanded && subs.length > 0 && (
                <ul className="grid gap-0.5 border-t bg-muted/30 p-2">
                  {subs.map((c) => (
                    <li key={c.id}>
                      <Link
                        to={`/shop?category=${c.slug}`}
                        onClick={() => recordInterest({ kind: 'category', category: c.slug, categoryName: c.name })}
                        className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 text-sm hover:bg-card"
                      >
                        <span className="font-medium">{t(c.name)}</span>
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          {(c.listingCount ?? 0).toLocaleString()}
                          <ArrowRight className="size-3.5" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
