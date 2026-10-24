import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronRight, Plus, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { formatETB } from '@/lib/format'
import { sellerApi, sellerCatalog } from '@/lib/seller-api'
import { cn } from '@/lib/utils'
import { ProductEditor } from '../admin/product-edit'
import { StockBadge, Thumb } from '../admin/products'
import { Pager } from '../admin/shared'

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Shown' },
  { value: 'low', label: 'Low stock' },
  { value: 'out', label: 'Sold out' },
  { value: 'hidden', label: 'Hidden' },
]

export function SellerProductsPage() {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? 'all'
  const q = params.get('q') ?? ''
  const page = Number(params.get('page') ?? 0)
  const [search, setSearch] = useState(q)
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    if (k !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }
  useEffect(() => {
    const t = setTimeout(() => search !== q && set('q', search || null), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const { data, isLoading } = useQuery({
    queryKey: ['seller-products', q, status, page],
    queryFn: () => sellerApi.products({ q, status, page }),
    placeholderData: keepPreviousData,
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex gap-1.5 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={status === f.value}
              onClick={() => set('status', f.value === 'all' ? null : f.value)}
              className={cn(
                'h-9 shrink-0 rounded-full border px-3.5 text-sm font-semibold',
                status === f.value ? 'border-primary bg-primary/10 text-primary' : 'bg-card text-muted-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 sm:ml-auto">
          <div className="relative flex-1 sm:w-56">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search your products" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button asChild><Link to="/seller/products/new"><Plus /> Add</Link></Button>
        </div>
      </div>
      {isLoading ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : data?.content.length === 0 ? (
        <div className="space-y-3 rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          <p>{q || status !== 'all' ? 'No products match.' : 'No products yet.'}</p>
          <Button asChild><Link to="/seller/products/new"><Plus /> Add a product</Link></Button>
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
          {data?.content.map((p) => (
            <li key={p.id}>
              <Link to={`/seller/products/${p.id}`} className="flex items-center gap-3 p-3 transition hover:bg-muted/50">
                <Thumb src={p.imageUrl} alt="" className="size-16 rounded-xl" />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate text-sm font-bold">{p.name}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatETB(p.price)} · {p.available} available{p.reserved > 0 && ` · ${p.reserved} held`}
                  </p>
                  <StockBadge p={p} />
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {data && <Pager page={page} totalPages={data.totalPages} total={data.totalElements} size={data.size} onPage={(p) => set('page', String(p))} />}
    </div>
  )
}

/** Same editor as the admin's, limited to this seller's products (no URL slug, no "featured"). */
export function SellerProductEditPage() {
  return <ProductEditor client={sellerCatalog} editable basePath="/seller/products" keyPrefix="seller" seller />
}
