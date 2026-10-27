import { useQuery } from '@tanstack/react-query'
import { Heart, Search } from 'lucide-react'
import { Link, Navigate } from 'react-router'

import { HeartButton } from '@/components/heart-button'
import { ProductCard } from '@/components/product-card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { favouriteApi } from '@/lib/favourite-api'
import { formatETB } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { useSession } from '@/store/session'

/** /favourites: the listings I hearted, with what changed since (cheaper now, sold, gone). */
export function FavouritesPage() {
  const t = useT()
  const session = useSession((s) => s.session)
  const q = useQuery({ queryKey: ['favourites'], queryFn: favouriteApi.mine, enabled: !!session })
  if (!session) return <Navigate to="/login?next=/favourites" replace />
  const list = q.data ?? []
  const live = list.filter((f) => f.product && f.inStore)
  const gone = list.filter((f) => !f.product || !f.inStore)
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight"><Heart className="size-6 fill-rose-600 text-rose-600" /> {t('Favourites')}</h1>
        <p className="text-muted-foreground">{t('Tap the heart on any listing to keep it here. We tell you when one gets cheaper.')}</p>
      </div>
      {q.isLoading && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-[3/4] rounded-2xl" />)}</div>}
      {q.data && list.length === 0 && (
        <div className="space-y-3 rounded-2xl border border-dashed p-10 text-center">
          <p className="text-muted-foreground">{t('No favourites yet.')}</p>
          <Button asChild><Link to="/shop"><Search /> {t('Go to the shop')}</Link></Button>
        </div>
      )}
      {live.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
          {live.map((f) => (
            <div key={f.productId} className="space-y-1">
              <ProductCard product={f.product!} />
              {f.priceWhenSaved != null && f.product!.price < f.priceWhenSaved && (
                <p className="px-1 text-xs font-semibold text-primary">
                  {t('Cheaper by {n} since you saved it', { n: formatETB(f.priceWhenSaved - f.product!.price) })}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      {gone.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">{t('No longer available')}</h2>
          <ul className="divide-y rounded-2xl border bg-card">
            {gone.map((f) => (
              <li key={f.productId} className="flex items-center gap-3 p-3 text-sm">
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {f.product ? f.product.name : t('A listing that was removed')}
                  {f.product && <> · {f.product.available <= 0 ? t('Sold out') : t('Hidden')}</>}
                </span>
                <HeartButton productId={f.productId} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
