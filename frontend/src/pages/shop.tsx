import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'

import { ProductCard } from '@/components/product-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { publicTrustApi } from '@/lib/trust-api'
import { useT } from '@/lib/i18n'
import { specsApi } from '@/lib/specs-api'
import { cn } from '@/lib/utils'
import { PriceRange, SaveSearchButton } from '@/components/save-search'

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
  const [near, setNear] = useMyArea()
  const areas = useQuery({ queryKey: ['areas'], queryFn: publicTrustApi.areas, staleTime: 10 * 60_000 })
  const [search, setSearch] = useState(q)

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
      if (search !== q) update({ q: search || null })
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
    queryKey: ['products', category, q, sort, page, filterKey, minPrice, maxPrice, area, near],
    queryFn: () => api.products({ category, q, sort, page, size: 12, minPrice, maxPrice, area, near, ...specFilters }),
    placeholderData: keepPreviousData,
  })
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

      <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex flex-wrap gap-2">
          <Chip active={!category} onClick={() => pickCategory(null)}>{t('All')}</Chip>
          {all.filter((c) => !c.parentId).map((c) => (
            <Chip key={c.slug} active={main?.id === c.id} onClick={() => pickCategory(c.slug)}>
              {c.name}
            </Chip>
          ))}
        </div>
        <div className="flex gap-2 lg:ml-auto">
          <div className="relative flex-1 lg:w-64">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Search products')} className="pl-8" />
          </div>
          <Select value={sort} onValueChange={(v) => update({ sort: v === 'newest' ? null : v })}>
            <SelectTrigger className="w-40" aria-label={t('Sort')}>
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
      </div>

      {subs.length > 0 && main && (
        <div className="mt-4 flex flex-wrap gap-2" aria-label={t('{name} types', { name: main.name })}>
          <SubChip active={current?.id === main.id} onClick={() => pickCategory(main.slug)}>{t('All {name}', { name: main.name.toLowerCase() })}</SubChip>
          {subs.map((s) => (
            <SubChip key={s.slug} active={current?.id === s.id} onClick={() => pickCategory(s.slug)}>{s.name}</SubChip>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <PriceRange min={minPrice} max={maxPrice} onChange={(a, b) => update({ minPrice: a || null, maxPrice: b || null })} />
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          {t('Area')}
          <select value={area} onChange={(e) => update({ area: e.target.value || null })}
            className={cn('block h-9 min-w-32 rounded-lg border bg-card px-2 text-sm text-foreground', area && 'border-primary')}>
            <option value="">{t('Anywhere in Sodo')}</option>
            {areas.data?.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground" title={t('Listings from your area come first')}>
          {t('I am in (near me first)')}
          <select value={near} onChange={(e) => setNear(e.target.value)}
            className={cn('block h-9 min-w-32 rounded-lg border bg-card px-2 text-sm text-foreground', near && 'border-primary')}>
            <option value="">{t('Not set')}</option>
            {areas.data?.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <SaveSearchButton
          className="ml-auto"
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
        <p className="mt-8 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t('No products match your filters.')}
        </p>
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
