import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'

import { useT } from '@/lib/i18n'
import { promoApi } from '@/lib/promo-api'
import { cn } from '@/lib/utils'

const SECONDS_PER_SLIDE = 6

type Slide = { id: string; title: string; subtitle: string | null; image: string | null; to: string | null }

/**
 * Shown until staff add banners in Admin (Banners). Real photos from the product photo set; change them here or
 * replace them with banners in the admin, which takes priority once there are any.
 */
const BUILT_IN: Slide[] = [
  { id: 'shop', title: 'Shop from sellers in Sodo', subtitle: 'Clothes, food, homes and electronics, all in one place.', image: '/products/habesha-netela.jpg', to: '/categories' },
  { id: 'sell', title: 'Open your shop. It is free.', subtitle: 'Reach buyers across Wolaita Sodo.', image: '/products/woven-mesob.jpg', to: '/sell' },
  { id: 'work', title: 'Find work near you', subtitle: 'Jobs, services and skilled people in Sodo.', image: '/products/leather-tote.jpg', to: '/work' },
  { id: 'pay', title: 'Pay with BillPay', subtitle: 'Secure checkout, and delivery across the town.', image: '/products/yirgacheffe-beans.jpg', to: '/shop' },
]

/** Sliding advert for the hero: auto-advances, pauses on hover, has arrows, dots and swipe (scroll-snap). */
export function HeroSlider({ variant = 'hero' }: { variant?: 'hero' | 'phone' }) {
  const t = useT()
  const navigate = useNavigate()
  const { data } = useQuery({ queryKey: ['banners'], queryFn: promoApi.banners, staleTime: 5 * 60_000 })
  // the phone panel uses its own picture (16:10), the desktop panel its own (4:3); each falls back to the one before
  const fromAdmin: Slide[] = (data ?? [])
    .filter((b) => b.active && b.showInHero)
    .map((b) => ({
      id: `b${b.id}`,
      title: b.title,
      subtitle: b.subtitle,
      image: variant === 'phone' ? (b.phoneUrl ?? b.heroUrl ?? b.imageUrl) : (b.heroUrl ?? b.imageUrl),
      to: b.linkUrl,
    }))
  const slides = fromAdmin.length ? fromAdmin : BUILT_IN

  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const reduced = usePrefersReducedMotion()
  const count = slides.length
  const current = index % count

  useEffect(() => {
    if (paused || reduced || count < 2) return
    const id = window.setInterval(() => setIndex((i) => (i + 1) % count), SECONDS_PER_SLIDE * 1000)
    return () => window.clearInterval(id)
  }, [paused, reduced, count])

  const go = (n: number) => setIndex(((n % count) + count) % count)

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={t('Featured')}
      className="group relative h-full w-full overflow-hidden bg-primary text-primary-foreground"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {slides.map((s, i) => (
        <div
          key={s.id}
          role="group"
          aria-roledescription="slide"
          aria-label={`${i + 1} / ${count}`}
          aria-hidden={i !== current}
          className={cn(
            'absolute inset-0 transition-opacity duration-700 ease-out',
            i === current ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        >
          {s.image && <img src={s.image} alt="" className="size-full object-cover" loading={i === 0 ? 'eager' : 'lazy'} />}
          <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
          <span className={cn("absolute inset-x-0 bottom-0 flex flex-col gap-2 p-5 sm:p-7 lg:px-14 lg:pb-16", variant === 'phone' && 'pb-16')}>
            <span className="text-xl font-extrabold leading-tight sm:text-2xl">{t(s.title)}</span>
            {s.subtitle && <span className="text-sm text-white/90">{t(s.subtitle)}</span>}
            {s.to && (
              <button
                type="button"
                tabIndex={i === current ? 0 : -1}
                onClick={() => (s.to!.startsWith('/') ? navigate(s.to!) : window.open(s.to!, '_blank', 'noopener'))}
                className="mt-1 w-fit rounded-full bg-market px-4 py-2 text-sm font-bold text-[#13201A] shadow-lg hover:brightness-95"
              >
                {t('Open')}
              </button>
            )}
          </span>
        </div>
      ))}

      {count > 1 && (
        <>
          <button
            type="button"
            aria-label={t('Previous')}
            onClick={() => go(current - 1)}
            className="absolute left-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white hover:bg-black/55 sm:left-3"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            aria-label={t('Next')}
            onClick={() => go(current + 1)}
            className="absolute right-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white hover:bg-black/55 sm:right-3"
          >
            <ChevronRight className="size-5" />
          </button>
          <div className="absolute right-4 top-4 flex gap-1.5">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-label={`${i + 1}`}
                aria-current={i === current}
                onClick={() => go(i)}
                className={cn('h-1.5 rounded-full transition-all', i === current ? 'w-6 bg-market' : 'w-2.5 bg-white/60')}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** True when the visitor asked for less motion; the slider then stops advancing by itself. */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return reduced
}
