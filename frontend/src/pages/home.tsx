import { useQuery } from '@tanstack/react-query'
import {
  Armchair,
  ArrowRight,
  BadgeCheck,
  Bike,
  BriefcaseBusiness,
  Coffee,
  CookingPot,
  Droplet,
  FileText,
  Footprints,
  GraduationCap,
  Handshake,
  type LucideIcon,
  MessageCircle,
  Phone,
  Search,
  Send,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  Smartphone,
  Store,
  Tag,
  Truck,
  Wheat,
  Wrench,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'

import { LogoSymbol } from '@/components/logo'
import { HomeBanners, TopListings } from '@/components/home-promos'
import { ProductCard } from '@/components/product-card'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api, type Product } from '@/lib/api'
import { useFeatures } from '@/lib/features'
import { useT } from '@/lib/i18n'
import { formatETB } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useSession } from '@/store/session'

/** Category icon by slug keyword; categories are managed in the admin, so unknown ones get a tag. */
const ICONS: [RegExp, LucideIcon][] = [
  [/cloth|fashion|dress|wear|kemis/, Shirt],
  [/shoe|sandal|boot/, Footprints],
  [/phone|electronic|gadget|computer/, Smartphone],
  [/furniture|sofa|home|living/, Armchair],
  [/kitchen|cook/, CookingPot],
  [/beauty|cosmetic|hair/, Droplet],
  [/vehicle|bike|motor|car|part|bajaj/, Bike],
  [/coffee|tea/, Coffee],
  [/food|pantry|spice|grain/, Wheat],
  [/used|second/, Tag],
]
const iconFor = (slug: string) => ICONS.find(([re]) => re.test(slug))?.[1] ?? ShoppingBag

/** Fades a section up the first time it scrolls into view (no motion for people who ask for less). */
function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!('IntersectionObserver' in window)) return setShown(true)
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true)
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} className={cn('reveal', shown && 'is-visible', className)} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  )
}

/** Section label: a small pill with a dot. */
function Eyebrow({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <p
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em]',
        light ? 'border-white/20 bg-white/10 text-[#F2C77E]' : 'border-market/30 bg-amber-soft/70 text-market-deep dark:bg-market/10 dark:text-market',
      )}
    >
      <span className={cn('size-1.5 rounded-full', light ? 'bg-[#F2C77E]' : 'bg-market')} />
      {children}
    </p>
  )
}

/** Soft moving glow behind a section (Sodo green and market amber). The section needs `relative isolate overflow-hidden`. */
function Aurora({ dark = false }: { dark?: boolean }) {
  return (
    <div className="aurora" aria-hidden>
      <span className={cn('-left-24 -top-32 size-[26rem] sm:size-[32rem]', dark ? 'bg-emerald-400/30' : 'bg-primary/35 dark:bg-primary/30')} />
      <span className={cn('-right-24 top-16 size-[22rem] sm:size-[28rem]', dark ? 'bg-[#F2C77E]/25' : 'bg-market/30 dark:bg-market/20')} />
      <span className={cn('-bottom-40 left-1/3 size-[24rem] sm:size-[30rem]', dark ? 'bg-teal-300/20' : 'bg-emerald-300/30 dark:bg-emerald-500/15')} />
    </div>
  )
}

/** Real numbers from the store (never invented): listings on sale now and categories. Hidden until there are some. */
function Stats() {
  const t = useT()
  const listings = useQuery({ queryKey: ['home-listing-count'], queryFn: () => api.products({ size: 1 }), staleTime: 60_000 })
  const cats = useQuery({ queryKey: ['categories'], queryFn: api.categories, staleTime: 5 * 60_000 })
  const count = listings.data?.totalElements ?? 0
  if (!count) return null
  const items = [
    { value: count.toLocaleString(), label: t('Listings now') },
    { value: String(cats.data?.length ?? '–'), label: t('Categories') },
    { value: t('Free'), label: t('for buyers') },
  ]
  return (
    <dl className="glass grid max-w-xl grid-cols-3 divide-x rounded-2xl border shadow-sm">
      {items.map((s) => (
        <div key={s.label} className="flex flex-col px-3 py-3 text-center sm:px-5">
          <dt className="order-2 text-[11px] font-medium text-muted-foreground sm:text-xs">{s.label}</dt>
          <dd className="text-xl font-extrabold tracking-tight sm:text-2xl">{s.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function SearchBox() {
  const t = useT()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  return (
    <form
      role="search"
      className="glass flex h-14 items-center gap-2 rounded-2xl border pl-4 pr-1.5 shadow-xl shadow-primary/10 ring-1 ring-white/50 transition focus-within:border-primary focus-within:shadow-primary/20 dark:ring-white/5 sm:h-16"
      onSubmit={(e) => {
        e.preventDefault()
        navigate(q.trim() ? `/shop?q=${encodeURIComponent(q.trim())}` : '/shop')
      }}
    >
      <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <label htmlFor="home-search" className="sr-only">{t('Search Sodo Gebeya')}</label>
      <input
        id="home-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('Search phones, sofas, tailors, jobs…')}
        className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
      />
      <Button type="submit" size="lg" className="h-11 rounded-xl px-5">{t('Search')}</Button>
    </form>
  )
}

/** Sample listings for the hero phone while the store is empty or still loading. */
const SAMPLE_LISTINGS: { name: string; price: string; icon: LucideIcon; tint: string }[] = [
  { name: 'Samsung A15, like new', price: '14,500 ETB', icon: Smartphone, tint: 'from-emerald-100 to-emerald-200 text-emerald-800' },
  { name: 'Habesha kemis', price: '3,800 ETB', icon: Shirt, tint: 'from-amber-100 to-amber-200 text-amber-800' },
  { name: '3-seat sofa', price: '22,000 ETB', icon: Armchair, tint: 'from-sky-100 to-sky-200 text-sky-800' },
  { name: 'Electrician, Arada', price: 'From 300 ETB', icon: Wrench, tint: 'from-rose-100 to-rose-200 text-rose-800' },
]

/** Phone status bar: time on the left, signal, Wi-Fi and battery on the right, the camera island in the middle. */
function StatusBar() {
  return (
    <div className="relative flex h-11 items-center justify-between px-7 pt-1 text-[11px] font-semibold text-foreground">
      <span className="tabular-nums">9:41</span>
      <span className="absolute left-1/2 top-2.5 h-[22px] w-[86px] -translate-x-1/2 rounded-full bg-black" />
      <span className="flex items-center gap-1">
        {/* signal bars */}
        <span className="flex items-end gap-[1.5px]">
          {[4, 6, 8, 10].map((h) => <span key={h} className="w-[3px] rounded-[1px] bg-current" style={{ height: h }} />)}
        </span>
        <svg viewBox="0 0 16 12" className="h-[10px] w-[14px] fill-current"><path d="M8 11.5 10.6 8.4a3.6 3.6 0 0 0-5.2 0zM3.6 6.6l1.3 1.5a4.7 4.7 0 0 1 6.2 0l1.3-1.5a6.7 6.7 0 0 0-8.8 0zM.8 3.4l1.3 1.5a8.9 8.9 0 0 1 11.8 0l1.3-1.5a10.9 10.9 0 0 0-14.4 0z" /></svg>
        {/* battery */}
        <span className="relative ml-0.5 flex h-[11px] w-[22px] items-center rounded-[3px] border border-current/50 p-[1.5px]">
          <span className="h-full w-[80%] rounded-[1.5px] bg-current" />
          <span className="absolute -right-[3px] h-[4px] w-[1.5px] rounded-r bg-current/50" />
        </span>
      </span>
    </div>
  )
}

/** The phone in the hero: a realistic handset showing the real app with live listings, plus two floating cards. */
function HeroPhone({ products, payments }: { products: Product[]; payments: boolean }) {
  const t = useT()
  const shown = products.filter((p) => p.imageUrl).slice(0, 4)
  const tabs: [LucideIcon, string][] = [[Store, 'Home'], [Wrench, 'Services'], [Tag, 'Sell'], [MessageCircle, 'Chats'], [GraduationCap, 'Jobs']]
  return (
    <div className="relative mx-auto w-[min(290px,78vw)] sm:w-[310px]" aria-hidden>
      {/* soft green glow behind the phone */}
      <div className="absolute -inset-10 -z-10 rounded-full bg-[radial-gradient(closest-side,rgba(19,120,90,0.28),transparent)] blur-2xl" />

      <div className="drift-slow relative">
        {/* side buttons */}
        <span className="absolute -left-[3px] top-[18%] h-6 w-[3px] rounded-l bg-[#2a3a33]" />
        <span className="absolute -left-[3px] top-[27%] h-11 w-[3px] rounded-l bg-[#2a3a33]" />
        <span className="absolute -left-[3px] top-[37%] h-11 w-[3px] rounded-l bg-[#2a3a33]" />
        <span className="absolute -right-[3px] top-[30%] h-16 w-[3px] rounded-r bg-[#2a3a33]" />

        {/* frame: a metal edge around a black bezel */}
        <div className="rounded-[3rem] bg-gradient-to-b from-[#4a5a52] via-[#1e2a24] to-[#3a4a42] p-[3px] shadow-[0_40px_80px_-20px_rgba(14,90,67,0.45),0_20px_40px_-20px_rgba(0,0,0,0.5)]">
          <div className="rounded-[2.85rem] bg-black p-[9px]">
            <div className="relative aspect-[9/19.5] overflow-hidden rounded-[2.35rem] bg-background">
              <StatusBar />

              {/* the app */}
              <div className="space-y-2.5 px-3.5 pt-1">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <LogoSymbol className="h-5 w-auto" />
                    <span className="text-[13px] font-extrabold">Sodo <span className="text-market-deep dark:text-market">Gebeya</span></span>
                  </span>
                  <span className="relative grid size-7 place-items-center rounded-full bg-muted">
                    <MessageCircle className="size-3.5" />
                    <span className="absolute -right-0.5 -top-0.5 grid size-3.5 place-items-center rounded-full bg-destructive text-[8px] font-bold text-white">2</span>
                  </span>
                </div>
                <div className="flex h-8 items-center gap-1.5 rounded-xl border bg-card px-2.5 text-[11px] text-muted-foreground shadow-sm">
                  <Search className="size-3.5" /> {t('Search in Sodo…')}
                </div>
                <div className="flex gap-1.5 text-[10px] font-semibold">
                  {['All', 'Phones', 'Clothes', 'Workers'].map((c, i) => (
                    <span key={c} className={cn('rounded-full px-2.5 py-1', i === 0 ? 'bg-primary text-primary-foreground' : 'border bg-card')}>{t(c)}</span>
                  ))}
                </div>
                <p className="pt-0.5 text-[11px] font-bold">{t('New near you')}</p>
                <div className="grid grid-cols-2 gap-2">
                  {shown.length >= 4
                    ? shown.map((p) => (
                        <div key={p.id} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                          <img src={p.imageUrl!} alt="" className="aspect-[4/3.4] w-full object-cover" loading="lazy" />
                          <div className="p-1.5">
                            <p className="truncate text-[10px] font-semibold">{p.name}</p>
                            <p className="text-[10.5px] font-extrabold text-market-deep dark:text-market">{formatETB(p.price)}</p>
                          </div>
                        </div>
                      ))
                    : SAMPLE_LISTINGS.map((s) => (
                        <div key={s.name} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                          <div className={cn('grid aspect-[4/3.4] place-items-center bg-gradient-to-br', s.tint)}>
                            <s.icon className="size-8" strokeWidth={1.6} />
                          </div>
                          <div className="p-1.5">
                            <p className="truncate text-[10px] font-semibold">{t(s.name)}</p>
                            <p className="text-[10.5px] font-extrabold text-market-deep dark:text-market">{s.price.replace('From', t('From')).replace('ETB', t('ETB'))}</p>
                          </div>
                        </div>
                      ))}
                </div>
              </div>

              {/* bottom tabs, like the real app */}
              <div className="absolute inset-x-0 bottom-0 border-t bg-card/95 pb-4 pt-1.5 backdrop-blur">
                <div className="grid grid-cols-5 text-[8.5px] font-medium text-muted-foreground">
                  {tabs.map(([Icon, label], i) => (
                    <span key={label} className={cn('flex flex-col items-center gap-0.5', i === 0 && 'font-bold text-primary')}>
                      <Icon className="size-4" />
                      {t(label)}
                    </span>
                  ))}
                </div>
                {/* home indicator */}
                <span className="absolute bottom-1.5 left-1/2 h-1 w-24 -translate-x-1/2 rounded-full bg-foreground/80" />
              </div>

              {/* glass reflection */}
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.18)_0%,rgba(255,255,255,0)_35%)]" />
            </div>
          </div>
        </div>
      </div>

      {/* floating cards: kept inside the screen width on phones */}
      <div className="drift absolute -left-6 top-[30%] w-44 rounded-2xl border bg-card/95 p-3 text-xs shadow-xl backdrop-blur sm:-left-20 sm:w-48">
        <p className="mb-1.5 flex items-center gap-1.5 font-semibold"><MessageCircle className="size-3.5 text-primary" /> {t('Chat with the seller')}</p>
        <p className="w-fit rounded-xl rounded-bl-sm bg-muted px-2.5 py-1.5">{t('Is it still available?')}</p>
        <p className="ml-auto mt-1 w-fit rounded-xl rounded-br-sm bg-primary px-2.5 py-1.5 text-primary-foreground">{t('Yes! Like new.')}</p>
      </div>
      <div className="drift absolute -right-5 bottom-[16%] w-40 rounded-2xl border bg-card/95 p-3 text-xs shadow-xl backdrop-blur [animation-delay:1.5s] sm:-right-16 sm:w-44">
        {payments ? (
          <>
            <p className="flex items-center gap-1.5 font-semibold"><ShieldCheck className="size-3.5 text-primary" /> {t('Money held safely')}</p>
            <p className="mt-1 text-muted-foreground">{t('Paid to the seller only when you confirm.')}</p>
          </>
        ) : (
          <>
            <p className="flex items-center gap-1.5 font-semibold"><Phone className="size-3.5 text-primary" /> {t('Call the seller')}</p>
            <p className="mt-1 text-muted-foreground">{t('Agree, meet in town, check it, then pay.')}</p>
          </>
        )}
      </div>
    </div>
  )
}

function Hero({ payments }: { payments: boolean }) {
  const t = useT()
  const featured = useQuery({ queryKey: ['featured'], queryFn: api.featured })
  const chips = [
    { label: 'Phones', to: '/shop?q=phone', icon: Smartphone },
    { label: 'Clothes', to: '/shop?q=cloth', icon: Shirt },
    { label: 'Furniture', to: '/shop?q=sofa', icon: Armchair },
    { label: 'Electricians', to: '/services', icon: Wrench },
    { label: 'Jobs', to: '/work', icon: BriefcaseBusiness },
  ]
  const trust = payments
    ? [{ icon: ShieldCheck, text: 'Money held safely' }, { icon: BadgeCheck, text: 'Verified sellers' }, { icon: Truck, text: 'Pick up or delivery' }]
    : [{ icon: MessageCircle, text: 'Chat before you buy' }, { icon: BadgeCheck, text: 'Verified sellers' }, { icon: Handshake, text: 'Free for buyers' }]
  return (
    <section className="relative isolate overflow-hidden">
      <Aurora />
      <div className="absolute inset-0 -z-10 bg-grid opacity-30 [mask-image:radial-gradient(ellipse_at_top,black,transparent_65%)]" />
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:pb-24 lg:pt-20">
        <div className="min-w-0 space-y-7">
          <Reveal>
            <span className="glass inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm">
              <span className="live-dot size-2 rounded-full bg-primary" aria-hidden />
              {t("Wolaita Sodo's own online market")}
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="text-[2.6rem] leading-[1.02] tracking-tight text-balance sm:text-6xl lg:text-7xl">
              {t('Buy, sell, hire and')} <span className="text-gradient-market">{t('get hired')}</span>{t(', all in Sodo.')}
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="max-w-xl text-base text-muted-foreground text-pretty sm:text-lg">
              {t('Find shops, used items and skilled workers near you.')}{' '}
              {payments ? t('Chat before you buy, pay safely, and pick up for free.') : t('Chat or call the seller, meet in town, and pay when you see it.')}
              <span className="hidden sm:inline"> {t('Students and graduates can build a free profile and send their CV in one tap.')}</span>
            </p>
          </Reveal>
          <Reveal delay={240} className="max-w-xl space-y-3">
            <SearchBox />
            {/* one swipeable row on phones, wrapping on wider screens */}
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
              {chips.map((c) => (
                  <Link key={c.label} to={c.to} className="glass flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium shadow-sm transition hover:-translate-y-0.5 hover:border-primary hover:text-primary">
                    <c.icon className="size-4 text-primary" /> {t(c.label)}
                  </Link>
              ))}
            </div>
          </Reveal>
          <Reveal delay={320}>
            <ul className="grid grid-cols-3 gap-2 text-xs font-medium sm:flex sm:flex-wrap sm:gap-x-6 sm:gap-y-2 sm:text-sm">
              {trust.map((x) => (
                <li key={x.text} className="flex flex-col items-center gap-1.5 rounded-xl border bg-card/70 px-2 py-2.5 text-center sm:flex-row sm:border-0 sm:bg-transparent sm:p-0 sm:text-left">
                  <span className="grid size-8 place-items-center rounded-full bg-accent sm:size-auto sm:bg-transparent"><x.icon className="size-4 text-primary" /></span>
                  {t(x.text)}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={400}>
            <Stats />
          </Reveal>
        </div>
        <div className="pin-drop min-w-0">
          <HeroPhone products={featured.data ?? []} payments={payments} />
        </div>
      </div>
    </section>
  )
}

/** A slow, endless strip of what people trade in Sodo. */
function Marquee() {
  const t = useT()
  const words = ['Phones', 'Habesha kemis', 'Sofas', 'Electricians', 'Tailors', 'Bajaj parts', 'Coffee', 'Tutors', 'Jobs', 'Used items', 'Shoes', 'Plumbers']
  return (
    <div className="overflow-hidden border-y bg-primary py-3 text-primary-foreground" aria-hidden>
      <div className="marquee flex w-max gap-10 whitespace-nowrap text-sm font-semibold">
        {[...words, ...words].map((w, i) => (
          <span key={i} className="flex items-center gap-10">{t(w)}<span className="size-1.5 rounded-full bg-market" /></span>
        ))}
      </div>
    </div>
  )
}

function Categories({ jobsOn }: { jobsOn: boolean }) {
  const t = useT()
  const { data, isLoading } = useQuery({ queryKey: ['categories'], queryFn: api.categories, staleTime: 5 * 60_000 })
  const extra = [
    { name: 'Skilled workers', note: 'Electricians, tailors, tutors', to: '/services', icon: Wrench },
    ...(jobsOn ? [{ name: 'Jobs', note: 'Local employers hiring', to: '/work', icon: BriefcaseBusiness }] : []),
  ]
  return (
    <section className="mx-auto max-w-7xl space-y-8 px-4 py-20 sm:px-6">
      <Reveal className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Eyebrow>{t('Everything in Sodo')}</Eyebrow>
          <h2 className="text-3xl sm:text-4xl">{t('One market, every need.')}</h2>
          <p className="max-w-xl text-muted-foreground">{t('New goods from local shops, used items from people near you, and skilled workers ready for the job.')}</p>
        </div>
        <Button asChild variant="outline" className="rounded-full"><Link to="/shop">{t('Browse all')} <ArrowRight /></Link></Button>
      </Reveal>
      {/* bento: one big "everything" tile, then categories, then workers and jobs in amber */}
      <div className="grid auto-rows-[minmax(7.5rem,auto)] grid-cols-2 gap-3 sm:grid-cols-4">
        <Reveal className="col-span-2 row-span-2">
          <Link
            to="/shop"
            className="bento-tile group relative isolate flex h-full min-h-60 flex-col justify-between overflow-hidden rounded-3xl bg-gradient-to-br from-[#13785A] via-[#0E5A43] to-[#0B3F30] p-6 text-white"
          >
            <span className="absolute -right-10 -top-10 -z-10 size-56 rounded-full bg-[#F2C77E]/25 blur-3xl" aria-hidden />
            <span className="absolute -bottom-16 -left-10 -z-10 size-56 rounded-full bg-emerald-300/20 blur-3xl" aria-hidden />
            <ShoppingBag className="size-10 text-[#F2C77E]" strokeWidth={1.6} />
            <span className="space-y-2">
              <span className="block text-2xl font-extrabold tracking-tight sm:text-3xl">{t('Browse all')}</span>
              <span className="block max-w-xs text-sm text-white/75">{t('Every listing in Sodo, in one place.')}</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold backdrop-blur transition group-hover:bg-white/25">
                {t('See everything')} <ArrowRight className="size-4 transition group-hover:translate-x-1" />
              </span>
            </span>
          </Link>
        </Reveal>
        {isLoading && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="rounded-3xl" />)}
        {data?.slice(0, jobsOn ? 6 : 7).map((c, i) => {
          const Icon = iconFor(c.slug)
          return (
            <Reveal key={c.id} delay={i * 50}>
              <Link to={`/shop?category=${c.slug}`} className="bento-tile group relative flex h-full flex-col justify-between gap-3 rounded-3xl border bg-card p-4 hover:border-primary/50">
                <span className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-accent to-primary/15 text-primary transition group-hover:from-primary group-hover:to-[#13785A] group-hover:text-primary-foreground">
                  <Icon className="size-5" />
                </span>
                <span className="text-sm font-bold">{c.name}</span>
                <ArrowRight className="absolute right-4 top-4 size-4 -translate-x-1 text-primary opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" aria-hidden />
              </Link>
            </Reveal>
          )
        })}
        {extra.map((c, i) => (
          <Reveal key={c.name} delay={(i + 6) * 50}>
            <Link to={c.to} className="bento-tile group relative flex h-full flex-col justify-between gap-3 rounded-3xl border border-market/30 bg-gradient-to-br from-amber-soft to-card p-4 hover:border-market dark:from-market/10">
              <span className="grid size-11 place-items-center rounded-2xl bg-market/20 text-market-deep transition group-hover:bg-market group-hover:text-[#13201A] dark:text-market"><c.icon className="size-5" /></span>
              <span><span className="block text-sm font-bold">{t(c.name)}</span><span className="block text-xs text-muted-foreground">{t(c.note)}</span></span>
              <ArrowRight className="absolute right-4 top-4 size-4 -translate-x-1 text-market-deep opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100 dark:text-market" aria-hidden />
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

function HowItWorks({ payments }: { payments: boolean }) {
  const t = useT()
  const steps: { title: string; text: string; icon: LucideIcon }[] = [
    { title: 'Find it', text: 'Search by price, compare items and read real reviews.', icon: Search },
    { title: 'Chat & agree', text: payments ? 'Ask questions and make your offer in the app.' : 'Chat in the app or call the seller, and agree on the price.', icon: MessageCircle },
    payments
      ? { title: 'Pay safely', text: 'Online with BillPay. Your money waits until you confirm.', icon: ShieldCheck }
      : { title: 'Meet & check', text: 'Meet in a public place in Sodo and check the item first.', icon: Handshake },
    payments
      ? { title: 'Pick up or deliver', text: 'Collect it, or get it delivered in town. Then confirm.', icon: Truck }
      : { title: 'Pay your way', text: 'Cash or mobile money, only after you\'re happy with it.', icon: BadgeCheck },
  ]
  return (
    <section className="relative isolate overflow-hidden bg-[#0E5A43] text-white">
      <Aurora dark />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      <div className="mx-auto max-w-7xl space-y-12 px-4 py-20 sm:px-6 lg:py-28">
        <Reveal className="mx-auto max-w-2xl space-y-3 text-center">
          <Eyebrow light>{t('How it works')}</Eyebrow>
          <h2 className="text-3xl text-balance sm:text-5xl">{t('From "I need this" to "I got it" in four steps.')}</h2>
        </Reveal>
        <ol className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {/* the line joining the steps on wide screens */}
          <span className="absolute left-[12%] right-[12%] top-12 hidden h-px bg-gradient-to-r from-transparent via-[#F2C77E]/50 to-transparent lg:block" aria-hidden />
          {steps.map((s, i) => (
            <li key={s.title} className="h-full">
              <Reveal delay={i * 100} className="h-full">
                <div className="relative h-full rounded-3xl border border-white/10 bg-white/[0.06] p-6 text-center backdrop-blur-md transition hover:-translate-y-1 hover:bg-white/10 lg:pt-8">
                  <span className="relative mx-auto grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-white/20 to-white/5 ring-1 ring-white/20">
                    <s.icon className="size-7 text-[#F2C77E]" strokeWidth={1.8} />
                    <span className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-[#F2C77E] text-[11px] font-extrabold text-[#13201A]">{i + 1}</span>
                  </span>
                  <p className="mt-5 text-lg font-bold">{t(s.title)}</p>
                  <p className="mt-1.5 text-sm text-white/75">{t(s.text)}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
        <Reveal>
          <p className="flex items-start gap-3 rounded-2xl bg-white p-4 text-sm text-[#13201A]">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#0E5A43]" />
            {payments ? (
              <span><strong>{t('Your money waits until you say "I got it".')}</strong> {t('When you pay online, the seller is paid only after you confirm. No more lost deposits.')}</span>
            ) : (
              <span><strong>{t('Never pay before you see the item.')}</strong> {t('Prefer sellers with the Verified badge, and report anything suspicious; our team checks every report.')}</span>
            )}
          </p>
        </Reveal>
      </div>
    </section>
  )
}

function Fresh() {
  const t = useT()
  const { data, isLoading } = useQuery({ queryKey: ['featured'], queryFn: api.featured })
  if (!isLoading && (!data || data.length === 0)) return null
  return (
    <section className="mx-auto max-w-7xl space-y-8 px-4 py-20 sm:px-6">
      <Reveal className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Eyebrow>{t('Fresh in Sodo')}</Eyebrow>
          <h2 className="text-3xl sm:text-4xl">{t('Popular right now')}</h2>
        </div>
        <Button asChild variant="outline" className="rounded-full"><Link to="/shop">{t('See everything')} <ArrowRight /></Link></Button>
      </Reveal>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {isLoading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="aspect-[3/4] rounded-2xl" />)}
        {data?.slice(0, 8).map((p, i) => (
          <Reveal key={p.id} delay={i * 60}><ProductCard product={p} /></Reveal>
        ))}
      </div>
    </section>
  )
}

function Workers() {
  const t = useT()
  const quotes = [
    { initial: 'D', name: 'Dawit Electric', meta: t('{r} rating · {n} jobs', { r: '4.9', n: 86 }) + ' · ' + t('Verified'), price: 400, best: true },
    { initial: 'A', name: 'Abebe & Sons', meta: t('{r} rating · {n} jobs', { r: '4.7', n: 52 }), price: 450 },
    { initial: 'S', name: 'Samuel Fix', meta: t('{r} rating · {n} jobs', { r: '4.6', n: 23 }), price: 380 },
  ]
  return (
    <section className="bg-card">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
        <Reveal className="space-y-5">
          <Eyebrow>{t('Skilled workers')}</Eyebrow>
          <h2 className="text-3xl sm:text-4xl">{t('Need a hand? Post the job, compare prices.')}</h2>
          <p className="text-muted-foreground">{t('Electricians, plumbers, tailors, carpenters, tutors and phone repair, with real reviews and photos of past work.')}</p>
          <ul className="space-y-2 text-sm">
            {['Describe the job, and workers send you their price.', 'Pick the best one, then agree on how to pay.', 'Verified workers carry a badge after an ID check.'].map((x) => (
              <li key={x} className="flex gap-2"><BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" /> {t(x)}</li>
            ))}
          </ul>
          <Button asChild size="lg" className="rounded-full"><Link to="/services">{t('Find a worker')} <ArrowRight /></Link></Button>
        </Reveal>
        <Reveal delay={150}>
          <div className="mx-auto max-w-md space-y-3 rounded-3xl border bg-background p-5 shadow-xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('Your job')}</p>
            <p className="text-lg font-bold">{t('Fix my kitchen lights')}</p>
            <p className="text-sm text-muted-foreground">{t('3 electricians sent a price')}</p>
            {quotes.map((q, i) => (
              <div key={q.name} className={cn('drift flex items-center gap-3 rounded-2xl border bg-card p-3', q.best && 'border-primary ring-2 ring-primary/15')} style={{ animationDelay: `${i * 0.8}s` }}>
                <span className="grid size-10 place-items-center rounded-full bg-primary font-bold text-primary-foreground">{q.initial}</span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{q.name}</span><span className="block text-xs text-muted-foreground">{q.meta}</span></span>
                <span className="text-sm font-extrabold">{q.price} {t('birr')}</span>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">{t('Example names and prices.')}</p>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function JobsAndCvs() {
  const t = useT()
  const f = useFeatures()
  if (!f.on('talent_profiles') && !f.on('job_posts') && !f.on('cv_service')) return null
  const packages = [
    { name: 'Basic CV', price: f.number('cv_basic_price'), days: '2 days', points: ['One-page professional CV', 'English or Amharic', '1 round of changes'] },
    { name: 'CV + cover letter', price: f.number('cv_cover_price'), days: '2 days', points: ['Everything in Basic', 'A cover letter you can adapt', 'PDF and Word files'], popular: true },
    { name: 'Premium', price: f.number('cv_premium_price'), days: '3 days', points: ['English and Amharic versions', 'Cover letter and profile text', '2 rounds of changes'] },
  ]
  const free = [
    { icon: GraduationCap, title: 'Free profile', text: 'Education, skills, languages and the work you want. You choose who can see it. Your phone number stays private.' },
    { icon: FileText, title: 'Free CV, ready to download', text: 'Your profile becomes a clean one-page CV in English or Amharic, and it updates itself.' },
    { icon: Send, title: 'Apply in one tap', text: 'Send your CV to employers in Sodo and follow every step: shortlisted, interview, hired.' },
  ]
  return (
    <section className="mx-auto max-w-7xl space-y-10 px-4 py-20 sm:px-6">
      <Reveal className="mx-auto max-w-2xl space-y-3 text-center">
        <Eyebrow>{t('Jobs & CVs')}</Eyebrow>
        <h2 className="text-3xl sm:text-4xl">{t('Students and graduates: get seen, get hired.')}</h2>
        <p className="text-muted-foreground">{t('Build a free profile in five minutes, download your CV, and apply to jobs in Sodo with one tap. Or let our team write a professional CV for you.')}</p>
      </Reveal>
      <div className="grid gap-4 md:grid-cols-3">
        {free.map((x, i) => (
          <Reveal key={x.title} delay={i * 100}>
            <div className="h-full rounded-2xl border bg-card p-5 transition hover:-translate-y-1 hover:shadow-lg">
              <span className="grid size-11 place-items-center rounded-xl bg-accent text-primary"><x.icon className="size-5" /></span>
              <p className="mt-4 font-bold">{t(x.title)}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t(x.text)}</p>
            </div>
          </Reveal>
        ))}
      </div>
      {f.on('cv_service') && (
        <Reveal>
          <div className="space-y-6 rounded-3xl border bg-card p-5 sm:p-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="space-y-1">
                <Eyebrow>{t('Professional CV service')}</Eyebrow>
                <p className="text-2xl font-extrabold">{t('Send us your details. We write your CV.')}</p>
                <p className="text-sm text-muted-foreground">{t('Written and designed by our team, in English or Amharic. PDF and Word.')} {t('{n}% off for verified students.', { n: f.number('student_discount') })}</p>
              </div>
              <Button asChild className="rounded-full bg-market text-[#13201A] hover:bg-market/90"><Link to="/work/cv">{t('Order my CV')}</Link></Button>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {packages.map((p) => (
                <div key={p.name} className={cn('relative rounded-2xl border p-5', p.popular && 'border-primary ring-2 ring-primary/15')}>
                  {p.popular && <span className="absolute -top-3 left-5 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold text-primary-foreground">{t('MOST CHOSEN')}</span>}
                  <p className="font-bold">{t(p.name)}</p>
                  <p className="mt-1"><span className="text-3xl font-extrabold">{p.price}</span> <span className="text-sm text-muted-foreground">{t('birr · ready in {days}', { days: t(p.days) })}</span></p>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {p.points.map((x) => <li key={x} className="flex gap-2"><BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" /> {t(x)}</li>)}
                  </ul>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              {t('Need it fast? Add 24-hour express for {fee} birr.', { fee: f.number('cv_express_fee') })}{f.on('job_posts') && <> {t('Hiring?')} <Link to="/work/post" className="font-semibold text-primary hover:underline">{t('Post your first job free')}</Link>.</>}
            </p>
          </div>
        </Reveal>
      )}
      <Reveal className="flex flex-wrap justify-center gap-3">
        <Button asChild size="lg" className="rounded-full"><Link to="/work/profile">{t('Make my free profile')}</Link></Button>
        <Button asChild size="lg" variant="outline" className="rounded-full"><Link to="/work">{t('See jobs in Sodo')}</Link></Button>
      </Reveal>
    </section>
  )
}

function ForSellers() {
  const t = useT()
  return (
    <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
      <Reveal>
        <div className="grid items-center gap-8 overflow-hidden rounded-3xl bg-amber-soft p-6 sm:p-10 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-4">
            <Eyebrow>{t('For sellers')}</Eyebrow>
            <h2 className="text-3xl sm:text-4xl">{t('Start free. Sell to all of Sodo.')}</h2>
            <p className="text-muted-foreground">{t('Open your shop in a minute, or sell a few things of your own. Buyers find you, chat with you and call you.')}</p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="rounded-full"><Link to="/sell"><Store /> {t('Start selling')}</Link></Button>
            </div>
          </div>
          <ul className="grid gap-3 text-sm">
            {[
              ['Free to post', 'Add photos, a price and the area. Show your products to buyers across Sodo.'],
              ['Verified badge', 'Send your ID once; buyers trust the badge.'],
              ['Chats and calls', 'Buyers message you in the app or call you directly.'],
            ].map(([x, d]) => (
              <li key={x} className="rounded-2xl bg-card p-4"><p className="font-semibold">{t(x)}</p><p className="text-muted-foreground">{t(d)}</p></li>
            ))}
          </ul>
        </div>
      </Reveal>
    </section>
  )
}

function Faq({ payments }: { payments: boolean }) {
  const t = useT()
  const items = [
    { q: 'Is it free for buyers?', a: 'Yes. Browsing, chatting and contacting sellers are always free.' },
    payments
      ? { q: 'What if the item is wrong or never arrives?', a: 'When you pay online, your money is held until you tap "I received my items". If something is wrong, don\'t confirm, and contact us: we sort it out with the seller.' }
      : { q: 'How do I pay?', a: 'You and the seller agree: cash or mobile money when you meet. Never pay before you\'ve seen the item, and prefer sellers with the Verified badge.' },
    { q: 'How do I get the Verified badge?', a: 'Open Sell → Get verified, add photos of your ID and a selfie holding it. Our team checks it, usually within a day.' },
    { q: 'Can employers see my phone number?', a: 'No. Your number stays private on your profile. Employers contact you in the app, and only see your number if you apply to their job.' },
  ]
  return (
    <section id="faq" className="mx-auto max-w-3xl space-y-6 px-4 pb-20 sm:px-6">
      <Reveal className="space-y-2 text-center">
        <Eyebrow>{t('Questions')}</Eyebrow>
        <h2 className="text-3xl sm:text-4xl">{t('Good to know')}</h2>
      </Reveal>
      <Reveal>
        <Accordion type="single" collapsible className="rounded-2xl border bg-card px-5">
          {items.map((f) => (
            <AccordionItem key={f.q} value={f.q}>
              <AccordionTrigger className="text-left font-semibold">{t(f.q)}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{t(f.a)}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Reveal>
    </section>
  )
}

function FinalCall() {
  const t = useT()
  const signedIn = useSession((s) => !!s.session)
  return (
    <section className="px-4 pb-24 sm:px-6">
      <Reveal>
        <div className="relative isolate mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#13785A] via-[#0E5A43] to-[#0B3F30] px-6 py-16 text-center text-white shadow-2xl shadow-primary/20 sm:py-24">
          <Aurora dark />
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
          <LogoSymbol onDark className="pointer-events-none absolute -right-10 -top-10 h-64 w-auto opacity-10" />
          <p className="font-ethiopic text-sm text-white/70">ሶዶ ገበያ · ይግዙ · ይሽጡ · ይቅጠሩ</p>
          <h2 className="mx-auto mt-3 max-w-3xl text-4xl text-balance sm:text-6xl">{t("Join Sodo's own market today. It's free.")}</h2>
          <p className="mx-auto mt-4 max-w-xl text-white/75 sm:text-lg">{t("Sign up with your phone number. One SMS code, and you're in.")}</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            {!signedIn && (
              <Button asChild size="lg" className="h-12 rounded-full bg-market px-7 text-base text-[#13201A] shadow-lg shadow-black/20 hover:bg-[#F2C77E]"><Link to="/register">{t('Create free account')} <ArrowRight /></Link></Button>
            )}
            <Button asChild size="lg" variant="outline" className="h-12 rounded-full border-white/30 bg-white/10 px-7 text-base text-white backdrop-blur-md hover:bg-white/20 hover:text-white">
              <Link to="/sell">{t('Start selling')}</Link>
            </Button>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

/** The landing page (design: Sodo-Gebeya-Landing-Page). Sections follow the feature switches in Admin → Features. */
export function HomePage() {
  const features = useFeatures()
  const jobsOn = features.on('talent_profiles') || features.on('job_posts')
  return (
    <>
      <Hero payments={features.payments} />
      <Marquee />
      <HomeBanners />
      <Categories jobsOn={jobsOn} />
      <HowItWorks payments={features.payments} />
      <TopListings />
      <Fresh />
      <Workers />
      <JobsAndCvs />
      <ForSellers />
      <Faq payments={features.payments} />
      <FinalCall />
    </>
  )
}
