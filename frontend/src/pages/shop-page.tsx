import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronLeft, MapPin, Store, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { ProductCard } from '@/components/product-card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { VerifiedBadge } from '@/components/verified-badge'
import { api, ApiError } from '@/lib/api'
import { useT } from '@/lib/i18n'
import { NotFoundPage } from './not-found'

const SIZE = 24

/** /shops/:slug: one seller's page with their products. Only approved shops are found. */
export function ShopPublicPage() {
  const t = useT()
  const { slug = '' } = useParams()
  const [page, setPage] = useState(0)
  const shop = useQuery({ queryKey: ['shop', slug], queryFn: () => api.shop(slug), retry: false })
  const products = useQuery({
    queryKey: ['products', 'shop', slug, page],
    queryFn: () => api.products({ shop: slug, page, size: SIZE }),
    enabled: !!shop.data,
    placeholderData: keepPreviousData,
  })

  if (shop.error instanceof ApiError && shop.error.status === 404) return <NotFoundPage />
  const s = shop.data
  const since = s ? new Date(s.memberSince).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : ''

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-4">
        <Link to="/shop"><ChevronLeft /> All products</Link>
      </Button>
      {!s ? (
        <Skeleton className="h-48 rounded-3xl" />
      ) : (
        <div className="overflow-hidden rounded-3xl border bg-card">
          {s.coverUrl ? (
            <img src={s.coverUrl} alt="" className="h-36 w-full object-cover sm:h-56" />
          ) : (
            <div className="h-20 bg-primary/10 sm:h-28" aria-hidden />
          )}
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:p-6">
            {s.logoUrl ? (
              <img src={s.logoUrl} alt="" className="-mt-14 size-24 rounded-2xl border-4 border-card object-cover sm:-mt-20" />
            ) : (
              <span className="-mt-14 grid size-24 place-items-center rounded-2xl border-4 border-card bg-primary text-2xl font-extrabold text-primary-foreground sm:-mt-20">
                {s.name.trim().slice(0, 2).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <h1 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
                {s.name} {s.verified && <VerifiedBadge className="text-xs" />}
                {s.pro && <span className="rounded-full bg-market px-2 py-0.5 text-xs font-bold text-[#13201A]">{t('Pro shop')}</span>}
              </h1>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  {s.kind === 'SHOP' ? <Store className="size-4" /> : <UserRound className="size-4" />}
                  {s.kind === 'SHOP' ? 'Shop' : 'Individual seller'}
                </span>
                {s.area && <span className="flex items-center gap-1"><MapPin className="size-4" /> {s.area}, Wolaita Sodo</span>}
                <span>On Sodo Gebeya since {since}</span>
              </p>
            </div>
          </div>
          {s.description && <p className="max-w-3xl whitespace-pre-line px-5 pb-6 text-sm text-pretty sm:px-6">{s.description}</p>}
        </div>
      )}

      <h2 className="mb-4 mt-8 text-lg font-bold">
        Products {s && <span className="font-normal text-muted-foreground">· {s.productCount}</span>}
      </h2>
      {products.data?.content.length === 0 && <p className="text-sm text-muted-foreground">No products in the store right now.</p>}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {products.data?.content.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
      {products.data && products.data.totalPages > 1 && (
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
          <Button variant="outline" disabled={page + 1 >= products.data.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  )
}
