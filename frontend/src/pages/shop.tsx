import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { ProductCard } from '@/components/product-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { publicTrustApi } from '@/lib/trust-api'
import { useT } from '@/lib/i18n'
import { recordInterest } from '@/lib/interests'
import { specsApi } from '@/lib/specs-api'
import { cn } from '@/lib/utils'
import { PriceRange, SaveSearchButton } from '@/components/save-search'
import { SearchSuggestions } from '@/components/search-suggestions'
import { rememberSearch } from '@/lib/recent-searches'

export function ShopPage() {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const category = params.get('category') ?? ''
  const q = params.get('q') ?? ''
  const sort = params.get('sort') ?? 'newest'
  const page = Number(params.get('page') ?? 0)
  const minPrice = params.get('minPrice') ?? ''
  const maxPrice = params.get('maxPrice') ?? ''
  const area = params.get('area') ?? ''
  const condition = params.get('condition') ?? ''
  const [near, setNear] = useMyArea()
  const areas = useQuery({ queryKey: ['areas'], queryFn: publicTrustApi.areas, staleTime: 10 * 60_000 })
  const [search, setSearch] = useState(q)
  const [typing, setTyping] = useState(false)

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next, { replace: true })
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== q) {
        update({ q: search || null })
        rememberSearch(search)
      }
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories })
  const all = categories.data ?? []
  const current = all.find((c) => c.slug === category)
  const main = current?.parentId ? all.find((c) => c.id === current.parentId) : current
  const subs = main ? all.filter((c) => c.parentId === main.id) : []
  const specFilters = Object.fromEntries([...params.entries()].filter(([k]) => k.startsWith('spec.'))) as Record<`spec.${string}`, string>
  const filterKey = JSON.stringify(specFilters)
  const facets = useQuery({
    queryKey: ['facets', category],
    queryFn: () => specsApi.bySlug(category, true),
    enabled: !!category,
    staleTime: 60_000,
  })
  const products = useQuery({
    queryKey: ['products', category, q, sort, page, filterKey, minPrice, maxPrice, area, near, condition],
    queryFn: () => api.products({ category, q, sort, page, size: 12, minPrice, maxPrice, area, near, condition, ...specFilters }),
    placeholderData: keepPreviousData,
  })
  // "For you" (on this device only): an opened category counts at once; a search counts once its results are in and
  // the words have stayed the same for 2 seconds, so half-typed words ("lap", "lapt") don't count
  useEffect(() => {
    if (current) recordInterest({ kind: 'category', category: current.slug, categoryName: current.name })
  }, [current])
  const results = products.data?.content
  useEffect(() => {
    if (!q || !results) return
    const timer = setTimeout(() => {
      const counts = new Map<string, { slug: string; name: string; n: number }>()
      for (const r of results) {
        const c = counts.get(r.categorySlug) ?? { slug: r.categorySlug, name: r.categoryName, n: 0 }
        c.n++
        counts.set(r.categorySlug, c)
      }
      // the category most results are in, when it's at least half of them
      const top = [...counts.values()].sort((a, b) => b.n - a.n)[0]
      const clear = top && top.n * 2 >= results.length ? top : undefined
      recordInterest({ kind: 'search', term: q, category: clear?.slug, categoryName: clear?.name })
    }, 2000)
    return () => clearTimeout(timer)
  }, [q, results])

  /** Picking another category clears the detail filters (they belong to the old one). */
  const pickCategory = (slug: string | null) => {
    const changes: Record<string, string | null> = { category: slug }
    for (const k of Object.keys(specFilters)) changes[k] = null
    update(changes)
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t('Shop')}</h1>
        <p className="text-muted-foreground">{t('Everything in stock, priced in Ethiopian Birr.')}</p>
      </div>

      <div className="mt-6 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setTyping(false)
                  update({ q: search.trim() || null })
                  rememberSearch(search)
                }
                if (e.key === 'Escape') setTyping(false)
              }}
              placeholder={t('Search products')}
              className="pl-8"
              role="combobox"
              aria-expanded={typing}
              aria-autocomplete="list"
            />
            {typing && (
              <SearchSuggestions
                term={search}
                onPick={(picked) => {
                  setSearch(picked)
                  setTyping(false)
                  update({ q: picked || null })
                  rememberSearch(picked)
                }}
              />
            )}
          </div>
          <Select value={sort} onValueChange={(v) => update({ sort: v === 'newest' ? null : v })}>
            <SelectTrigger className="h-10 w-44 shrink-0 bg-card sm:w-52" aria-label={t('Sort')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">{t('Newest')}</SelectItem>
              <SelectItem value="price_asc">{t('Price: low to high')}</SelectItem>
              <SelectItem value="price_desc">{t('Price: high to low')}</SelectItem>
              <SelectItem value="name">{t('Name')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [&>*]:shrink-0 [&>*]:whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Chip active={!category} onClick={() => pickCategory(null)}>{t('All')}</Chip>
          {all.filter((c) => !c.parentId).map((c) => (
            <Chip key={c.slug} active={main?.id === c.id} onClick={() => pickCategory(c.slug)}>
              {c.name}
            </Chip>
          ))}
        </div>

        {subs.length > 0 && main && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [&>*]:shrink-0 [&>*]:whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label={t('{name} types', { name: main.name })}>
            <SubChip active={current?.id === main.id} onClick={() => pickCategory(main.slug)}>{t('All {name}', { name: main.name.toLowerCase() })}</SubChip>
            {subs.map((s) => (
              <SubChip key={s.slug} active={current?.id === s.id} onClick={() => pickCategory(s.slug)}>{s.name}</SubChip>
            ))}
          </div>
        )}

        <div className="rounded-2xl border bg-card p-3 sm:p-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <PriceRange min={minPrice} max={maxPrice} onChange={(a, b) => update({ minPrice: a || null, maxPrice: b || null })} />
            <label className="space-y-1.5 text-xs font-semibold text-muted-foreground">
              {t('Condition')}
              <select value={condition} onChange={(e) => update({ condition: e.target.value || null })}
                className={cn('block h-10 w-full rounded-lg border bg-card px-3 text-sm text-foreground', condition && 'border-primary')}>
                <option value="">{t('Any condition')}</option>
                <option value="NEW">{t('New')}</option>
                <option value="LIKE_NEW">{t('Like new')}</option>
                <option value="USED">{t('Used')}</option>
              </select>
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-muted-foreground">
              {t('Area')}
              <select value={area} onChange={(e) => update({ area: e.target.value || null })}
                className={cn('block h-10 w-full rounded-lg border bg-card px-3 text-sm text-foreground', area && 'border-primary')}>
                <option value="">{t('Anywhere in Sodo')}</option>
                {areas.data?.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-muted-foreground" title={t('Listings from your area come first')}>
              {t('I am in (near me first)')}
              <select value={near} onChange={(e) => setNear(e.target.value)}
                className={cn('block h-10 w-full rounded-lg border bg-card px-3 text-sm text-foreground', near && 'border-primary')}>
                <option value="">{t('Not set')}</option>
                {areas.data?.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <SaveSearchButton
              input={{
                q: q || undefined,
                category: category || undefined,
                specs: Object.fromEntries(Object.entries(specFilters).map(([k, v]) => [k.slice(5), v])),
                minPrice: minPrice ? Number(minPrice) : null,
                maxPrice: maxPrice ? Number(maxPrice) : null,
              }}
              disabled={!q && !category}
            />
          </div>
        </div>
      </div>

      {!!facets.data?.facets.length && (
        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-3">
          {facets.data.facets.map((f) => {
            const key = `spec.${f.key}` as const
            const val = specFilters[key] ?? ''
            return (
              <label key={f.key} className="space-y-1 text-xs font-medium text-muted-foreground">
                {f.label}
                <select
                  value={val}
                  onChange={(e) => update({ [key]: e.target.value || null })}
                  className={cn('block h-9 min-w-32 rounded-lg border bg-background px-2 text-sm text-foreground', val && 'border-primary')}
                >
                  <option value="">{t('Any')}</option>
                  {f.values.map((v) => (
                    <option key={v.value} value={v.value}>
                      {f.type === 'YES_NO' ? (v.value === 'true' ? t('Yes') : t('No')) : v.value} ({v.count})
                    </option>
                  ))}
                </select>
              </label>
            )
          })}
          {Object.keys(specFilters).length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => pickCategory(category)}><X /> {t('Clear filters')}</Button>
          )}
        </div>
      )}

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {products.isLoading && Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-2xl" />)}
        {products.data?.content.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
      {products.isError && (
        <p className="mt-8 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t('Products could not be loaded. Please try again.')}
        </p>
      )}
      {products.data && products.data.content.length === 0 && (
        <div className="mt-8 space-y-3 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          <p>{q ? t('Nothing matches "{q}".', { q }) : t('No products match your filters.')}</p>
          <ul className="space-y-1">
            {q && <li>{t('Check the spelling, or use fewer words.')}</li>}
            {(minPrice || maxPrice || area || condition) && <li>{t('Try removing a filter, such as the price or the area.')}</li>}
            <li>{t('Browse the categories instead.')}</li>
          </ul>
          <Link to="/categories" className="inline-block font-semibold text-brand hover:underline">{t('All categories')}</Link>
        </div>
      )}

      {products.data && products.data.totalPages > 1 && (
        <div className="mt-10 flex items-center justify-center gap-3">
          <Button variant="outline" disabled={page === 0} onClick={() => update({ page: String(page - 1) })}>
            {t('Previous')}
          </Button>
          <span className="text-sm text-muted-foreground">
            {t('Page {page} of {pages}', { page: page + 1, pages: products.data.totalPages })}
          </span>
          <Button
            variant="outline"
            disabled={page + 1 >= products.data.totalPages}
            onClick={() => update({ page: String(page + 1) })}
          >
            {t('Next')}
          </Button>
        </div>
      )}
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3.5 py-1.5 text-sm font-medium transition',
        active ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
      )}
    >
      {children}
    </button>
  )
}

function SubChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-lg border px-3 py-1 text-sm transition',
        active ? 'border-primary bg-primary/10 font-semibold text-primary' : 'bg-background text-muted-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  )
}

const MY_AREA = 'sodo-my-area'

/** The shopper's own area, remembered on this device: listings from there come first. */
function useMyArea(): [string, (v: string) => void] {
  const [v, setV] = useState(() => {
    try {
      return localStorage.getItem(MY_AREA) ?? ''
    } catch {
      return ''
    }
  })
  const set = (next: string) => {
    setV(next)
    try {
      if (next) localStorage.setItem(MY_AREA, next)
      else localStorage.removeItem(MY_AREA)
    } catch {
      /* private mode */
    }
  }
  return [v, set]
}
