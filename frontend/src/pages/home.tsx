import { useQueries, useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  ChevronRight,
  Eraser,
  Handshake,
  Heart,
  History,
  Info,
  MapPin,
  Scissors,
  Search,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Store,
  Users,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'

import { HeartButton } from '@/components/heart-button'
import { HomeBanners, TopListings } from '@/components/home-promos'
import { ProductCard } from '@/components/product-card'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { api, type Product } from '@/lib/api'
import { categoryLook, type MainCategory, useCategoryTree } from '@/lib/category-tree'
import { useFeatures } from '@/lib/features'
import { formatETB } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { clearInterests, setInterestsOn, useInterests } from '@/lib/interests'
import { rowsFor, type Row } from '@/lib/interests-core'
import { cn } from '@/lib/utils'
import { useSession } from '@/store/session'

/*
 * Home page, design of 16 November 2026: hero (headline, search, Buy / Sell / Find work), popular categories with
 * photos, "Picked for you" (from this visitor's own activity, on this device), recently listed next to local services,
 * paid top listings, "Why Sodo Gebeya?", questions.
 *
 * The hero photo is /brand/hero-sodo.jpg (frontend/public/brand/): a real photo of Sodo, landscape 4:3 or wider, at
 * least 1600 px wide. Until it exists, a drawn Sodo landscape in the brand colours stands in.
 */
const HERO_PHOTO = '/brand/hero-sodo.jpg'

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

/** Section heading with the orange bar, and a "Browse all" style link on the right. */
function SectionTitle({ title, to, link, id }: { title: string; to?: string; link?: string; id?: string }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <h2 id={id} className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight sm:text-2xl">
        <span className="h-6 w-1.5 shrink-0 rounded-full bg-market sm:h-7" aria-hidden />
        {title}
      </h2>
      {to && link && (
        <Link to={to} className="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline">
          {link} <ArrowRight className="size-4" />
        </Link>
      )}
    </div>
  )
}

/** "5 min ago", "2h ago", "3 days ago". */
function useAgo() {
  const t = useT()
  return (iso?: string | null) => {
    if (!iso) return null
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
    if (mins < 60) return mins <= 1 ? t('just now') : t('{n} min ago', { n: mins })
    const hours = Math.round(mins / 60)
    if (hours < 24) return t('{n}h ago', { n: hours })
    const days = Math.round(hours / 24)
    return days === 1 ? t('1 day ago') : t('{n} days ago', { n: days })
  }
}

// ------------------------------------------------------------------ hero

function SearchBox({ compact = false }: { compact?: boolean }) {
  const t = useT()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  return (
    <form
      role="search"
      className="flex h-14 items-center gap-2 rounded-full border bg-card pl-5 pr-1.5 shadow-lg shadow-primary/5 transition focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10"
      onSubmit={(e) => {
        e.preventDefault()
        navigate(q.trim() ? `/shop?q=${encodeURIComponent(q.trim())}` : '/shop')
      }}
    >
      <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <label htmlFor={compact ? 'home-search-phone' : 'home-search'} className="sr-only">{t('Search Sodo Gebeya')}</label>
      <input
        id={compact ? 'home-search-phone' : 'home-search'}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={compact ? t('Search…') : t('Search for products, services or jobs…')}
        className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
      />
      <Button type="submit" className={cn('h-11 rounded-full', compact ? 'w-11 px-0' : 'px-7 text-base')} aria-label={t('Search')}>
        {compact ? <Search className="size-5" /> : t('Search')}
      </Button>
    </form>
  )
}

/** The photo of Sodo, or a drawn landscape in the brand colours until the photo is added. */
function HeroPicture({ className }: { className?: string }) {
  const [broken, setBroken] = useState(false)
  if (!broken) {
    return <img src={HERO_PHOTO} alt="" onError={() => setBroken(true)} className={cn('size-full object-cover', className)} />
  }
  return (
    <svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" className={cn('size-full', className)} aria-hidden>
      <defs>
        <linearGradient id="hero-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#BFE3F2" />
          <stop offset="1" stopColor="#EAF6EF" />
        </linearGradient>
      </defs>
      <rect width="800" height="600" fill="url(#hero-sky)" />
      <circle cx="640" cy="130" r="54" fill="#F7C873" opacity="0.9" />
      <path d="M0 330 C140 250 260 300 380 250 S640 200 800 260 V600 H0Z" fill="#9CCFAE" />
      <path d="M0 400 C160 330 300 380 450 330 S700 300 800 350 V600 H0Z" fill="#4FA57A" />
      <path d="M0 470 C180 420 330 470 500 420 S720 400 800 430 V600 H0Z" fill="#1F7A56" />
      <path d="M0 540 C200 500 380 540 560 505 S740 490 800 510 V600 H0Z" fill="#0E5A43" />
      {/* the town: rows of little roofs on the hills */}
      {Array.from({ length: 26 }).map((_, i) => {
        const x = 40 + (i % 13) * 58 + (i > 12 ? 24 : 0)
        const y = (i > 12 ? 440 : 380) + Math.sin(i) * 12
        return (
          <g key={i}>
            <rect x={x} y={y} width="26" height="18" rx="2" fill="#F5F1E8" />
            <path d={`M${x - 3} ${y} L${x + 13} ${y - 11} L${x + 29} ${y}Z`} fill={i % 3 ? '#C0532F' : '#8C6A4A'} />
          </g>
        )
      })}
    </svg>
  )
}

function QuickActions({ jobsOn }: { jobsOn: boolean }) {
  const t = useT()
  const actions: { icon: LucideIcon; title: string; note: string; to: string }[] = [
    { icon: ShoppingCart, title: 'Buy', note: 'Find products', to: '/shop' },
    { icon: Store, title: 'Sell', note: 'List your items', to: '/sell' },
    jobsOn
      ? { icon: BriefcaseBusiness, title: 'Find Work', note: 'Explore local jobs', to: '/work' }
      : { icon: Wrench, title: 'Hire', note: 'Skilled workers', to: '/services' },
  ]
  return (
    <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
      {actions.map((a) => (
        <Link
          key={a.title}
          to={a.to}
          className="group flex flex-col items-center gap-1.5 rounded-2xl border border-primary/10 bg-accent/70 px-2 py-3 text-center transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-accent sm:flex-row sm:gap-3 sm:px-4 sm:text-left"
        >
          <a.icon className="size-7 shrink-0 text-primary transition group-hover:scale-110" strokeWidth={1.8} />
          <span>
            <span className="block text-sm font-bold">{t(a.title)}</span>
            <span className="hidden text-xs text-muted-foreground sm:block">{t(a.note)}</span>
          </span>
        </Link>
      ))}
    </div>
  )
}

function Headline() {
  const t = useT()
  return (
    <h1 className="text-[2.35rem] font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
      {t('Discover. Buy. Sell.')}
      <br />
      {t('All in')}{' '}
      <span className="relative whitespace-nowrap text-market">
        {t('Sodo.')}
        {/* the hand-drawn swoosh after "Sodo." */}
        <svg viewBox="0 0 120 20" className="absolute -right-24 top-1/2 hidden w-20 text-market sm:block" aria-hidden>
          <path d="M4 14 C40 4 80 4 116 10" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        </svg>
      </span>
    </h1>
  )
}

function Hero({ jobsOn }: { jobsOn: boolean }) {
  const t = useT()
  return (
    <section className="relative isolate overflow-hidden">
      {/* phone: the photo first, edge to edge, with the orange and green wave under it */}
      <div className="relative aspect-[16/10] w-full sm:hidden">
        <HeroPicture />
        <svg viewBox="0 0 400 60" preserveAspectRatio="none" className="absolute inset-x-0 -bottom-px h-12 w-full" aria-hidden>
          <path d="M0 30 C120 0 260 70 400 20 V60 H0Z" className="fill-market" />
          <path d="M0 42 C130 14 270 76 400 34 V60 H0Z" className="fill-primary" />
          <path d="M0 52 C140 30 280 80 400 46 V60 H0Z" className="fill-background" />
        </svg>
      </div>

      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-8 pt-3 sm:px-6 sm:pb-14 sm:pt-12 lg:grid-cols-[1.05fr_0.95fr] lg:pb-16">
        <div className="min-w-0 space-y-5 sm:space-y-6">
          <Reveal className="hidden sm:block">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-primary">
              <MapPin className="size-4" /> {t('Wolaita Sodo')}
            </span>
          </Reveal>
          <Reveal delay={60}><Headline /></Reveal>
          <Reveal delay={120}>
            <p className="max-w-lg text-base text-muted-foreground sm:text-lg">
              {t('Your local marketplace for products, services and job opportunities.')}
            </p>
          </Reveal>
          <Reveal delay={180} className="max-w-xl space-y-4">
            <div className="sm:hidden"><SearchBox compact /></div>
            <div className="hidden sm:block"><SearchBox /></div>
            <RecentSearches />
            <QuickActions jobsOn={jobsOn} />
          </Reveal>
        </div>

        {/* wide screens: the photo in a soft blob, the orange marks and the "Support local" note */}
        <div className="relative hidden lg:block">
          <span className="absolute -left-3 top-8 z-10 flex flex-col gap-2" aria-hidden>
            <span className="h-1.5 w-7 -rotate-[35deg] rounded-full bg-market" />
            <span className="ml-3 h-1.5 w-8 -rotate-[10deg] rounded-full bg-market" />
            <span className="ml-1 h-1.5 w-6 rotate-[20deg] rounded-full bg-market" />
          </span>
          <div className="relative aspect-[4/3] overflow-hidden shadow-2xl shadow-primary/20 [border-radius:58%_42%_38%_62%/52%_40%_60%_48%]">
            <HeroPicture />
            <svg viewBox="0 0 400 80" preserveAspectRatio="none" className="absolute inset-x-0 -bottom-px h-16 w-full" aria-hidden>
              <path d="M0 60 C140 20 260 90 400 30 V80 H0Z" className="fill-primary" />
            </svg>
          </div>
          <Reveal delay={400} className="absolute -bottom-2 right-6">
            <p className="flex rotate-[-6deg] items-center gap-2 rounded-2xl bg-card px-5 py-3 text-lg font-bold italic leading-tight text-primary shadow-xl">
              <span>{t('Support Local')}<br />{t('Grow Together')}</span>
              <Heart className="size-5 fill-market text-market" />
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/** This visitor's last searches (on this device), as one-tap chips under the search box. */
function RecentSearches() {
  const recent = useInterests().summary.searches.slice(0, 3)
  if (recent.length === 0) return null
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
      {recent.map((term) => (
        <Link key={term} to={`/shop?q=${encodeURIComponent(term)}`} className="flex shrink-0 items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm font-medium transition hover:border-primary hover:text-primary">
          <History className="size-3.5 text-primary" /> {term}
        </Link>
      ))}
    </div>
  )
}

// ------------------------------------------------------------------ popular categories

/** Chosen photos for main categories whose newest listing may not show them well (e.g. a black phone screen). */
const CATEGORY_PHOTOS: Record<string, string> = {
  electronics: '/demo/demo-surface-laptop-5.jpg',
}

/** A real photo for a category: a chosen one, else the newest listing in it that has one. */
function useCategoryPhoto(slug: string) {
  const { data } = useQuery({
    queryKey: ['category-photo', slug],
    queryFn: () => api.products({ category: slug, size: 6 }),
    staleTime: 10 * 60_000,
  })
  return CATEGORY_PHOTOS[slug] ?? data?.content.find((p) => p.imageUrl)?.imageUrl ?? null
}

function CategoryTile({ to, name, photo, icon: Icon, tint }: { to: string; name: string; photo: string | null; icon: LucideIcon; tint: string }) {
  return (
    <Link to={to} className="group block overflow-hidden rounded-2xl border bg-card transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10">
      <span className={cn('relative block aspect-[4/3] overflow-hidden bg-gradient-to-br', tint)}>
        {photo ? (
          <img src={photo} alt="" loading="lazy" className="size-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <span className="grid size-full place-items-center"><Icon className="size-10" strokeWidth={1.6} /></span>
        )}
      </span>
      <span className="block truncate px-2 py-2.5 text-center text-sm font-bold sm:text-[15px]">{name}</span>
    </Link>
  )
}

function MainCategoryTile({ main }: { main: MainCategory }) {
  const t = useT()
  const look = categoryLook(main.slug)
  return <CategoryTile to={`/shop?category=${main.slug}`} name={t(main.name)} photo={useCategoryPhoto(main.slug)} {...look} />
}

/** Six tiles: the visitor's own top categories first (then the ones with most listings), then Services and Jobs. */
function PopularCategories({ jobsOn }: { jobsOn: boolean }) {
  const t = useT()
  const { tree, isLoading } = useCategoryTree()
  const { summary } = useInterests()
  const mainOf = new Map<string, number>()
  for (const m of tree) {
    mainOf.set(m.slug, m.id)
    for (const c of m.children) mainOf.set(c.slug, m.id)
  }
  const interest = new Map<number, number>()
  for (const c of summary.categories) {
    const id = mainOf.get(c.slug)
    if (id != null) interest.set(id, (interest.get(id) ?? 0) + c.score)
  }
  const mains = tree
    .filter((m) => (m.listingCount ?? 0) > 0)
    .sort((a, b) => (interest.get(b.id) ?? 0) - (interest.get(a.id) ?? 0) || (b.listingCount ?? 0) - (a.listingCount ?? 0))
    .slice(0, jobsOn ? 4 : 5)
  return (
    <section className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6 sm:py-10">
      <SectionTitle title={t('Popular Categories')} to="/categories" link={t('Browse all')} />
      <div className="grid grid-cols-3 gap-2.5 sm:gap-4 lg:grid-cols-6">
        {isLoading && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="aspect-[4/3.9] rounded-2xl" />)}
        {mains.map((m) => <MainCategoryTile key={m.id} main={m} />)}
        {!isLoading && (
          <>
            <CategoryTile to="/services" name={t('Services')} photo="/demo/demo-cordless-drill-18-v.jpg" icon={Wrench} tint="from-amber-500/15 to-amber-500/5 text-amber-700" />
            {jobsOn && <CategoryTile to="/work" name={t('Jobs')} photo={null} icon={BriefcaseBusiness} tint="from-amber-500/25 to-amber-200/40 text-amber-800" />}
          </>
        )}
      </div>
    </section>
  )
}

// ------------------------------------------------------------------ picked for you

/**
 * "Picked for you": up to 3 rows from what this visitor searched for, opened and saved on this device (never sent to
 * the server), then their recently viewed listings. Hidden on a first visit; "Why these?" explains it and has the
 * off switch; "Clear my history" forgets everything.
 */
function ForYou() {
  const t = useT()
  const { on, summary } = useInterests()
  const [why, setWhy] = useState(false)
  const rows = rowsFor(summary)
  if (!on) {
    return (
      <p className="mx-auto max-w-7xl px-4 text-xs text-muted-foreground sm:px-6">
        {t('Suggestions from your activity are off.')}{' '}
        <button type="button" onClick={() => setInterestsOn(true)} className="font-semibold text-primary hover:underline">{t('Turn on')}</button>
      </p>
    )
  }
  if (rows.length === 0 && summary.viewed.length < 2) return null
  return (
    <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6" aria-labelledby="for-you-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionTitle id="for-you-title" title={t('Picked for you')} />
        <div className="flex flex-wrap items-center gap-1 text-sm">
          <Button variant="ghost" size="sm" className="rounded-full" aria-expanded={why} onClick={() => setWhy(!why)}>
            <Info /> {t('Why these?')}
          </Button>
          <Button variant="ghost" size="sm" className="rounded-full" onClick={() => { clearInterests(); toast.success(t('Your history on this device is cleared.')) }}>
            <Eraser /> {t('Clear my history')}
          </Button>
        </div>
      </div>
      {why && (
        <div className="space-y-3 rounded-2xl border bg-accent/50 p-4 text-sm">
          <p>{t('These come from what you searched for, opened and saved on this phone or computer in the last 30 days. It stays on this device: Sodo Gebeya never receives it.')}</p>
          <label className="flex w-fit items-center gap-3 font-medium">
            <Switch checked={on} onCheckedChange={setInterestsOn} />
            {t('Use my activity to suggest listings')}
          </label>
        </div>
      )}
      {rows.map((r) => <ForYouRow key={r.kind === 'category' ? `c-${r.slug}` : r.kind === 'brand' ? `b-${r.name}` : `s-${r.term}`} row={r} />)}
      <RecentlyViewed slugs={summary.viewed} />
    </section>
  )
}

/** One sideways-scrolling row of 8 listings; hidden when fewer than 4 are found. */
function ForYouRow({ row }: { row: Row }) {
  const t = useT()
  const params = row.kind === 'category' ? { category: row.slug } : { q: row.kind === 'brand' ? row.name : row.term }
  const { data, isLoading } = useQuery({
    queryKey: ['for-you', row],
    queryFn: () => api.products({ ...params, size: 8 }),
    staleTime: 60_000,
  })
  const items = data?.content ?? []
  if (!isLoading && items.length < 4) return null
  const title =
    row.kind === 'category' ? t('Because you looked at {name}', { name: t(row.name) })
      : row.kind === 'brand' ? t('More from {name}', { name: row.name })
        : t('You searched for "{term}"', { term: row.term })
  const to = row.kind === 'category' ? `/shop?category=${row.slug}` : `/shop?q=${encodeURIComponent(row.kind === 'brand' ? row.name : row.term)}`
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-base font-bold sm:text-lg"><Sparkles className="size-4 text-market" /> {title}</h3>
        <Link to={to} className="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline">{t('See all')} <ArrowRight className="size-4" /></Link>
      </div>
      <ScrollRow>
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="aspect-[3/4] rounded-2xl" />)
          : items.map((p) => <div key={p.id} className="snap-start"><ProductCard product={p} /></div>)}
      </ScrollRow>
    </div>
  )
}

/** The last listings this visitor opened that are still in the store (a sold or removed one just drops out). */
function RecentlyViewed({ slugs }: { slugs: string[] }) {
  const t = useT()
  const results = useQueries({
    queries: slugs.map((slug) => ({ queryKey: ['product', slug], queryFn: () => api.product(slug), staleTime: 60_000, retry: false })),
  })
  const items = results.map((r) => r.data).filter((p): p is Product => !!p)
  if (items.length < 2) return null
  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 text-base font-bold sm:text-lg"><History className="size-4 text-primary" /> {t('Recently viewed')}</h3>
      <ScrollRow>{items.map((p) => <div key={p.id} className="snap-start"><ProductCard product={p} /></div>)}</ScrollRow>
    </div>
  )
}

function ScrollRow({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 grid snap-x snap-mandatory auto-cols-[minmax(10rem,46%)] grid-flow-col gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:auto-cols-[31%] sm:px-0 lg:auto-cols-[23.5%]">
      {children}
    </div>
  )
}

// ------------------------------------------------------------------ recently listed + local services

/** Phones: photo on the left, details on the right. Wider screens: photo on top (4:3). The heart sits on the photo. */
function ListedCard({ p }: { p: Product }) {
  const t = useT()
  const ago = useAgo()
  const when = ago(p.listedAt)
  return (
    <div className="group relative overflow-hidden rounded-2xl border bg-card transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/10">
      <Link to={`/product/${p.slug}`} className="flex items-center gap-3 p-2 sm:block sm:p-0">
        <span className="relative block size-24 shrink-0 overflow-hidden rounded-xl bg-muted sm:aspect-[4/3] sm:size-auto sm:rounded-none">
          {p.imageUrl ? (
            <img src={p.imageUrl} alt="" loading="lazy" className="size-full object-cover transition duration-500 group-hover:scale-105" />
          ) : (
            <span className="grid size-full place-items-center text-muted-foreground"><Store className="size-8" /></span>
          )}
        </span>
        <span className="block min-w-0 flex-1 space-y-1 pr-10 sm:p-4">
          <span className="block truncate font-semibold">{p.name}</span>
          <span className="block text-lg font-extrabold text-primary">{formatETB(p.price)}</span>
          <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            <MapPin className="size-3.5 shrink-0 text-primary" />
            {p.area || t('Wolaita Sodo')}{when && ` · ${when}`}
          </span>
        </span>
      </Link>
      <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-card/90 shadow-sm backdrop-blur sm:top-2 sm:translate-y-0">
        <HeartButton productId={p.id} product={p} />
      </span>
    </div>
  )
}

function RecentlyListed() {
  const t = useT()
  const { data, isLoading } = useQuery({ queryKey: ['recently-listed'], queryFn: () => api.products({ size: 4, sort: 'newest' }), staleTime: 60_000 })
  const items = data?.content ?? []
  if (!isLoading && items.length === 0) return null
  return (
    <div className="space-y-4">
      <SectionTitle title={t('Recently Listed')} to="/shop" link={t('View all')} />
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        {isLoading && Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl sm:aspect-[4/4.2] sm:h-auto" />)}
        {items.slice(0, 2).map((p) => <ListedCard key={p.id} p={p} />)}
        {/* phones get two more in the list */}
        {items.slice(2, 4).map((p) => <div key={p.id} className="sm:hidden"><ListedCard p={p} /></div>)}
      </div>
    </div>
  )
}

const SERVICES: { trade: string; title: string; note: string; icon: LucideIcon; tint: string }[] = [
  { trade: 'ELECTRICIAN', title: 'Electricians', note: 'Professional & reliable', icon: Zap, tint: 'from-amber-400/30 to-amber-200/30 text-amber-700' },
  { trade: 'TAILOR', title: 'Tailors', note: 'Quality tailoring services', icon: Scissors, tint: 'from-rose-400/25 to-rose-200/30 text-rose-700' },
  { trade: 'PLUMBER', title: 'Plumbers', note: 'Fast and trusted service', icon: Wrench, tint: 'from-sky-400/25 to-sky-200/30 text-sky-700' },
]

function LocalServices() {
  const t = useT()
  return (
    <div className="space-y-4">
      <SectionTitle title={t('Local Services')} to="/services" link={t('View all')} />
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
        {SERVICES.map((s) => (
          <li key={s.trade}>
            <Link to={`/services?trade=${s.trade}`} className="group flex items-center gap-4 p-3 transition hover:bg-accent/50 sm:p-4">
              <span className={cn('grid size-14 shrink-0 place-items-center rounded-xl bg-gradient-to-br sm:h-16 sm:w-24', s.tint)}>
                <s.icon className="size-7" strokeWidth={1.7} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{t(s.title)}</span>
                <span className="block truncate text-sm text-muted-foreground">{t(s.note)}</span>
              </span>
              <ChevronRight className="size-5 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ------------------------------------------------------------------ why sodo gebeya

function WhySodo() {
  const t = useT()
  const signedIn = useSession((s) => !!s.session)
  const points: { icon: LucideIcon; text: string }[] = [
    { icon: ShieldCheck, text: 'Safe & Trusted' },
    { icon: Users, text: 'Local Community' },
    { icon: Zap, text: 'Easy to Use' },
  ]
  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <Reveal>
        <div className="flex flex-col gap-6 rounded-3xl border border-primary/10 bg-gradient-to-r from-accent via-accent/60 to-accent p-6 sm:p-8 lg:flex-row lg:items-center">
          <div className="flex items-center gap-4 lg:w-[34%]">
            <Handshake className="size-14 shrink-0 text-primary" strokeWidth={1.5} />
            <div>
              <p className="text-xl font-extrabold">{t('Why Sodo Gebeya?')}</p>
              <p className="text-sm text-muted-foreground">{t('A simple and trusted platform for our community.')}</p>
            </div>
          </div>
          <ul className="grid flex-1 grid-cols-3 gap-2 lg:divide-x lg:divide-primary/15">
            {points.map((p) => (
              <li key={p.text} className="flex flex-col items-center gap-1.5 text-center text-sm font-semibold">
                <p.icon className="size-7 text-primary" strokeWidth={1.8} />
                {t(p.text)}
              </li>
            ))}
          </ul>
          <Button asChild size="lg" className="h-12 rounded-full bg-market px-7 text-base font-bold text-white shadow-lg shadow-market/30 hover:bg-market-deep">
            <Link to={signedIn ? '/sell' : '/register'}>{signedIn ? t('Start selling') : t('Join Now')} <ArrowRight /></Link>
          </Button>
        </div>
      </Reveal>
    </section>
  )
}

// ------------------------------------------------------------------ questions

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
    <section id="faq" className="mx-auto max-w-3xl space-y-5 px-4 pb-16 pt-6 sm:px-6">
      <SectionTitle title={t('Good to know')} />
      <Accordion type="single" collapsible className="rounded-2xl border bg-card px-5">
        {items.map((f) => (
          <AccordionItem key={f.q} value={f.q}>
            <AccordionTrigger className="text-left font-semibold">{t(f.q)}</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">{t(f.a)}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <BadgeCheck className="size-3.5 text-primary" /> {t('Prefer sellers with the Verified badge.')}
      </p>
    </section>
  )
}

export function HomePage() {
  const features = useFeatures()
  const jobsOn = features.on('talent_profiles') || features.on('job_posts')
  return (
    <>
      <Hero jobsOn={jobsOn} />
      <HomeBanners />
      <PopularCategories jobsOn={jobsOn} />
      <ForYou />
      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:gap-10">
        <RecentlyListed />
        <LocalServices />
      </section>
      <TopListings />
      <WhySodo />
      <Faq payments={features.payments} />
    </>
  )
}
