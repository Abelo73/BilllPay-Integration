import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'

import { ProductCard } from '@/components/product-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

export function ShopPage() {
  const [params, setParams] = useSearchParams()
  const category = params.get('category') ?? ''
  const q = params.get('q') ?? ''
  const sort = params.get('sort') ?? 'newest'
  const page = Number(params.get('page') ?? 0)
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
    const t = setTimeout(() => {
      if (search !== q) update({ q: search || null })
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories })
  const products = useQuery({
    queryKey: ['products', category, q, sort, page],
    queryFn: () => api.products({ category, q, sort, page, size: 12 }),
    placeholderData: keepPreviousData,
  })

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Shop</h1>
        <p className="text-muted-foreground">Everything in stock, priced in Ethiopian Birr.</p>
      </div>

      <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex flex-wrap gap-2">
          <Chip active={!category} onClick={() => update({ category: null })}>All</Chip>
          {categories.data?.map((c) => (
            <Chip key={c.slug} active={category === c.slug} onClick={() => update({ category: c.slug })}>
              {c.name}
            </Chip>
          ))}
        </div>
        <div className="flex gap-2 lg:ml-auto">
          <div className="relative flex-1 lg:w-64">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products" className="pl-8" />
          </div>
          <Select value={sort} onValueChange={(v) => update({ sort: v === 'newest' ? null : v })}>
            <SelectTrigger className="w-40" aria-label="Sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="price_asc">Price: low to high</SelectItem>
              <SelectItem value="price_desc">Price: high to low</SelectItem>
              <SelectItem value="name">Name</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {products.isLoading && Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-2xl" />)}
        {products.data?.content.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
      {products.isError && (
        <p className="mt-8 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Products could not be loaded. Please try again.
        </p>
      )}
      {products.data && products.data.content.length === 0 && (
        <p className="mt-8 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No products match your filters.
        </p>
      )}

      {products.data && products.data.totalPages > 1 && (
        <div className="mt-10 flex items-center justify-center gap-3">
          <Button variant="outline" disabled={page === 0} onClick={() => update({ page: String(page - 1) })}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {products.data.totalPages}
          </span>
          <Button
            variant="outline"
            disabled={page + 1 >= products.data.totalPages}
            onClick={() => update({ page: String(page + 1) })}
          >
            Next
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
