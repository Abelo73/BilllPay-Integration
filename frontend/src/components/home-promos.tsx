import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Rocket } from 'lucide-react'
import { useNavigate } from 'react-router'

import { ProductCard } from '@/components/product-card'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { promoApi, type Banner } from '@/lib/promo-api'

/** Home page banners (M17), managed in Admin → Banners. Clicks are counted. */
export function HomeBanners() {
  const { data } = useQuery({ queryKey: ['banners'], queryFn: promoApi.banners, staleTime: 5 * 60_000 })
  const t = useT()
  const navigate = useNavigate()
  if (!data?.length) return null
  const open = async (b: Banner) => {
    const to = await promoApi.bannerClick(b.id).then((r) => r.linkUrl).catch(() => b.linkUrl ?? '/')
    if (to.startsWith('/')) navigate(to)
    else window.open(to, '_blank', 'noopener')
  }
  return (
    <section aria-label={t('Special offers')} className="mx-auto max-w-7xl px-4 pt-10 sm:px-6">
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
        {data.map((b) => (
          <button key={b.id} type="button" onClick={() => open(b)}
            className={cn('group relative shrink-0 snap-start overflow-hidden rounded-3xl bg-primary text-left text-primary-foreground',
              // one banner fills the row; several scroll side by side
              data.length === 1 ? 'aspect-[5/2] w-full sm:aspect-[4/1]' : 'aspect-[3/1] w-[88%] sm:w-[70%] lg:w-[48%]')}>
            {b.imageUrl && <img src={b.imageUrl} alt="" className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-[1.03]" />}
            <span className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/20 to-transparent" />
            <span className="relative flex h-full flex-col justify-end gap-1 p-5 sm:p-7">
              <span className="text-xl font-extrabold leading-tight sm:text-2xl">{b.title}</span>
              {b.subtitle && <span className="text-sm text-white/85">{b.subtitle}</span>}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

/** Boosted listings (M16): on top, paid by sellers. */
export function TopListings() {
  const t = useT()
  const navigate = useNavigate()
  const { data } = useQuery({ queryKey: ['boosted'], queryFn: promoApi.boosted, staleTime: 60_000 })
  if (!data?.length) return null
  return (
    <section className="mx-auto max-w-7xl space-y-6 px-4 pt-16 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="flex items-center gap-2 text-2xl sm:text-3xl"><Rocket className="size-6 text-market" /> {t('Top listings')}</h2>
        <button type="button" onClick={() => navigate('/shop')} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
          {t('See everything')} <ArrowRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {data.slice(0, 8).map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </section>
  )
}
