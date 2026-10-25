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
import { ProductCard } from '@/components/product-card'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api, type Product } from '@/lib/api'
import { useFeatures } from '@/lib/features'
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

function Eyebrow({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <p className={cn('text-xs font-bold uppercase tracking-[0.18em]', light ? 'text-[#F2C77E]' : 'text-market-deep dark:text-market')}>
      {children}
    </p>
  )
}

function SearchBox() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  return (
    <form
      role="search"
      className="flex h-14 items-center gap-2 rounded-2xl border bg-card pl-4 pr-1.5 shadow-lg shadow-primary/5 transition focus-within:border-primary focus-within:shadow-primary/10"
      onSubmit={(e) => {
        e.preventDefault()
        navigate(q.trim() ? `/shop?q=${encodeURIComponent(q.trim())}` : '/shop')
      }}
    >
      <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <label htmlFor="home-search" className="sr-only">Search Sodo Gebeya</label>
      <input
        id="home-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search phones, sofas, tailors, jobs…"
        className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
      />
      <Button type="submit" size="lg" className="h-11 rounded-xl px-5">Search</Button>
    </form>
  )
}

/** The phone in the hero: real listings from the store, a chat bubble and a contact card, gently floating. */
function HeroPhone({ products, payments }: { products: Product[]; payments: boolean }) {
  const shown = products.slice(0, 4)
  return (
    <div className="relative mx-auto w-full max-w-[340px]" aria-hidden>
      <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-primary/10 blur-2xl" />
      <div className="drift-slow rounded-[2.5rem] border-[10px] border-[#13201A] bg-background shadow-2xl">
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <LogoSymbol className="h-6 w-auto" />
            <span className="text-sm font-extrabold">Sodo <span className="text-market-deep dark:text-market">Gebeya</span></span>
          </div>
          <div className="flex h-9 items-center gap-2 rounded-xl border bg-card px-3 text-xs text-muted-foreground">
            <Search className="size-3.5" /> Search in Sodo…
          </div>
          <div className="flex gap-1.5 text-[10px] font-semibold">
            {['All', 'Phones', 'Jobs', 'Workers'].map((c, i) => (
              <span key={c} className={cn('rounded-full px-2.5 py-1', i === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted')}>{c}</span>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(shown.length ? shown : Array.from({ length: 4 })).map((p, i) => {
              const product = p as Product | undefined
              return (
                <div key={product?.id ?? i} className="overflow-hidden rounded-xl border bg-card">
                  {product?.imageUrl ? (
                    <img src={product.imageUrl} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="grid aspect-square place-items-center bg-accent text-primary"><ShoppingBag className="size-6" /></div>
                  )}
                  <div className="space-y-0.5 p-2">
                    <p className="truncate text-[10px] font-semibold">{product?.name ?? 'Item near you'}</p>
                    <p className="text-[11px] font-extrabold text-market-deep dark:text-market">{product ? formatETB(product.price) : '—'}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="drift absolute -left-10 top-24 w-48 rounded-2xl border bg-card p-3 text-xs shadow-xl sm:-left-16">
        <p className="mb-1.5 flex items-center gap-1.5 font-semibold"><MessageCircle className="size-3.5 text-primary" /> Chat with the seller</p>
        <p className="w-fit rounded-xl rounded-bl-sm bg-muted px-2.5 py-1.5">Is it still available?</p>
        <p className="ml-auto mt-1 w-fit rounded-xl rounded-br-sm bg-primary px-2.5 py-1.5 text-primary-foreground">Yes! Like new.</p>
      </div>
      <div className="drift absolute -right-6 bottom-14 w-44 rounded-2xl border bg-card p-3 text-xs shadow-xl [animation-delay:1.5s] sm:-right-12">
        {payments ? (
          <>
            <p className="flex items-center gap-1.5 font-semibold"><ShieldCheck className="size-3.5 text-primary" /> Money held safely</p>
            <p className="mt-1 text-muted-foreground">Paid to the seller only when you confirm.</p>
          </>
        ) : (
          <>
            <p className="flex items-center gap-1.5 font-semibold"><Phone className="size-3.5 text-primary" /> Call the seller</p>
            <p className="mt-1 text-muted-foreground">Agree, meet in town, check it, then pay.</p>
          </>
        )}
      </div>
    </div>
  )
}

function Hero({ payments }: { payments: boolean }) {
  const featured = useQuery({ queryKey: ['featured'], queryFn: api.featured })
  const chips = [
    { label: 'Phones', to: '/shop?q=phone' },
    { label: 'Clothes', to: '/shop?q=cloth' },
    { label: 'Furniture', to: '/shop?q=sofa' },
    { label: 'Electricians', to: '/services' },
    { label: 'Jobs', to: '/work' },
  ]
  const trust = payments
    ? [{ icon: ShieldCheck, text: 'Money held safely' }, { icon: BadgeCheck, text: 'Verified sellers' }, { icon: Truck, text: 'Pick up or delivery' }]
    : [{ icon: MessageCircle, text: 'Chat before you buy' }, { icon: BadgeCheck, text: 'Verified sellers' }, { icon: Handshake, text: 'Free for buyers' }]
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-grid opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:pb-24 lg:pt-16">
        <div className="space-y-7">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-semibold shadow-sm">
              <span className="rounded-full bg-market px-1.5 py-0.5 text-[10px] font-extrabold text-[#13201A]">NEW</span>
              Wolaita Sodo's own online market
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="text-4xl leading-[1.05] tracking-tight text-balance sm:text-6xl">
              Buy, sell, hire and <span className="text-market-deep dark:text-market">get hired</span>, all in Sodo.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="max-w-xl text-lg text-muted-foreground text-pretty">
              Find shops, used items and skilled workers near you.{' '}
              {payments ? 'Chat before you buy, pay safely, and pick up for free.' : 'Chat or call the seller, meet in town, and pay when you see it.'}{' '}
              Students and graduates can build a free profile and send their CV in one tap.
            </p>
          </Reveal>
          <Reveal delay={240} className="max-w-xl space-y-3">
            <SearchBox />
            <div className="flex flex-wrap gap-2">
              {chips.map((c) => (
                <Link key={c.label} to={c.to} className="rounded-full border bg-card px-3.5 py-1.5 text-sm font-medium transition hover:-translate-y-0.5 hover:border-primary hover:text-primary">
                  {c.label}
                </Link>
              ))}
            </div>
          </Reveal>
          <Reveal delay={320}>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium">
              {trust.map((t) => (
                <li key={t.text} className="flex items-center gap-2"><t.icon className="size-4 text-primary" /> {t.text}</li>
              ))}
            </ul>
          </Reveal>
        </div>
        <div className="pin-drop">
          <HeroPhone products={featured.data ?? []} payments={payments} />
        </div>
      </div>
    </section>
  )
}

/** A slow, endless strip of what people trade in Sodo. */
function Marquee() {
  const words = ['Phones', 'Habesha kemis', 'Sofas', 'Electricians', 'Tailors', 'Bajaj parts', 'Coffee', 'Tutors', 'Jobs', 'Used items', 'Shoes', 'Plumbers']
  return (
    <div className="overflow-hidden border-y bg-primary py-3 text-primary-foreground" aria-hidden>
      <div className="marquee flex w-max gap-10 whitespace-nowrap text-sm font-semibold">
        {[...words, ...words].map((w, i) => (
          <span key={i} className="flex items-center gap-10">{w}<span className="size-1.5 rounded-full bg-market" /></span>
        ))}
      </div>
    </div>
  )
}

function Categories({ jobsOn }: { jobsOn: boolean }) {
  const { data, isLoading } = useQuery({ queryKey: ['categories'], queryFn: api.categories, staleTime: 5 * 60_000 })
  const extra = [
    { name: 'Skilled workers', note: 'Electricians, tailors, tutors', to: '/services', icon: Wrench },
    ...(jobsOn ? [{ name: 'Jobs', note: 'Local employers hiring', to: '/work', icon: BriefcaseBusiness }] : []),
  ]
  return (
    <section className="mx-auto max-w-7xl space-y-8 px-4 py-20 sm:px-6">
      <Reveal className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Eyebrow>Everything in Sodo</Eyebrow>
          <h2 className="text-3xl sm:text-4xl">One market, every need.</h2>
          <p className="max-w-xl text-muted-foreground">New goods from local shops, used items from people near you, and skilled workers ready for the job.</p>
        </div>
        <Button asChild variant="outline" className="rounded-full"><Link to="/shop">Browse all <ArrowRight /></Link></Button>
      </Reveal>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {isLoading && Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        {data?.slice(0, jobsOn ? 6 : 7).map((c, i) => {
          const Icon = iconFor(c.slug)
          return (
            <Reveal key={c.id} delay={i * 50}>
              <Link to={`/shop?category=${c.slug}`} className="group flex h-full items-center gap-3 rounded-2xl border bg-card p-4 transition hover:-translate-y-1 hover:border-primary hover:shadow-lg">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-primary transition group-hover:bg-primary group-hover:text-primary-foreground"><Icon className="size-5" /></span>
                <span className="text-sm font-semibold">{c.name}</span>
              </Link>
            </Reveal>
          )
        })}
        {extra.map((c, i) => (
          <Reveal key={c.name} delay={(i + 6) * 50}>
            <Link to={c.to} className="group flex h-full items-center gap-3 rounded-2xl border bg-card p-4 transition hover:-translate-y-1 hover:border-market hover:shadow-lg">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-amber-soft text-market-deep transition group-hover:bg-market group-hover:text-[#13201A] dark:text-market"><c.icon className="size-5" /></span>
              <span><span className="block text-sm font-semibold">{c.name}</span><span className="block text-xs text-muted-foreground">{c.note}</span></span>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

function HowItWorks({ payments }: { payments: boolean }) {
  const steps = [
    { title: 'Find it', text: 'Search by price, compare items and read real reviews.' },
    { title: 'Chat & agree', text: payments ? 'Ask questions and make your offer in the app.' : 'Chat in the app or call the seller, and agree on the price.' },
    payments
      ? { title: 'Pay safely', text: 'Online with BillPay. Your money waits until you confirm.' }
      : { title: 'Meet & check', text: 'Meet in a public place in Sodo and check the item first.' },
    payments
      ? { title: 'Pick up or deliver', text: 'Collect it, or get it delivered in town. Then confirm.' }
      : { title: 'Pay your way', text: 'Cash or mobile money, only after you\'re happy with it.' },
  ]
  return (
    <section className="bg-[#0E5A43] text-white">
      <div className="mx-auto max-w-7xl space-y-10 px-4 py-20 sm:px-6">
        <Reveal className="space-y-2">
          <Eyebrow light>How it works</Eyebrow>
          <h2 className="text-3xl sm:text-4xl">From "I need this" to "I got it" in four steps.</h2>
        </Reveal>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <Reveal key={s.title} delay={i * 100}>
              <li className="h-full rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:bg-white/10">
                <span className="text-3xl font-extrabold text-[#F2C77E]">0{i + 1}</span>
                <p className="mt-3 text-lg font-bold">{s.title}</p>
                <p className="mt-1 text-sm text-white/75">{s.text}</p>
              </li>
            </Reveal>
          ))}
        </ol>
        <Reveal>
          <p className="flex items-start gap-3 rounded-2xl bg-white p-4 text-sm text-[#13201A]">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#0E5A43]" />
            {payments ? (
              <span><strong>Your money waits until you say "I got it".</strong> When you pay online, the seller is paid only after you confirm. No more lost deposits.</span>
            ) : (
              <span><strong>Never pay before you see the item.</strong> Prefer sellers with the Verified badge, and report anything suspicious; our team checks every report.</span>
            )}
          </p>
        </Reveal>
      </div>
    </section>
  )
}

function Fresh() {
  const { data, isLoading } = useQuery({ queryKey: ['featured'], queryFn: api.featured })
  if (!isLoading && (!data || data.length === 0)) return null
  return (
    <section className="mx-auto max-w-7xl space-y-8 px-4 py-20 sm:px-6">
      <Reveal className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Eyebrow>Fresh in Sodo</Eyebrow>
          <h2 className="text-3xl sm:text-4xl">Popular right now</h2>
        </div>
        <Button asChild variant="outline" className="rounded-full"><Link to="/shop">See everything <ArrowRight /></Link></Button>
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
  const quotes = [
    { initial: 'D', name: 'Dawit Electric', meta: '4.9 rating · 86 jobs · Verified', price: 400, best: true },
    { initial: 'A', name: 'Abebe & Sons', meta: '4.7 rating · 52 jobs', price: 450 },
    { initial: 'S', name: 'Samuel Fix', meta: '4.6 rating · 23 jobs', price: 380 },
  ]
  return (
    <section className="bg-card">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
        <Reveal className="space-y-5">
          <Eyebrow>Skilled workers</Eyebrow>
          <h2 className="text-3xl sm:text-4xl">Need a hand? Post the job, compare prices.</h2>
          <p className="text-muted-foreground">Electricians, plumbers, tailors, carpenters, tutors and phone repair, with real reviews and photos of past work.</p>
          <ul className="space-y-2 text-sm">
            {['Describe the job, and workers send you their price.', 'Pick the best one, then agree on how to pay.', 'Verified workers carry a badge after an ID check.'].map((t) => (
              <li key={t} className="flex gap-2"><BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" /> {t}</li>
            ))}
          </ul>
          <Button asChild size="lg" className="rounded-full"><Link to="/services">Find a worker <ArrowRight /></Link></Button>
        </Reveal>
        <Reveal delay={150}>
          <div className="mx-auto max-w-md space-y-3 rounded-3xl border bg-background p-5 shadow-xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your job</p>
            <p className="text-lg font-bold">Fix my kitchen lights</p>
            <p className="text-sm text-muted-foreground">3 electricians sent a price</p>
            {quotes.map((q, i) => (
              <div key={q.name} className={cn('drift flex items-center gap-3 rounded-2xl border bg-card p-3', q.best && 'border-primary ring-2 ring-primary/15')} style={{ animationDelay: `${i * 0.8}s` }}>
                <span className="grid size-10 place-items-center rounded-full bg-primary font-bold text-primary-foreground">{q.initial}</span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{q.name}</span><span className="block text-xs text-muted-foreground">{q.meta}</span></span>
                <span className="text-sm font-extrabold">{q.price} birr</span>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">Example names and prices.</p>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function JobsAndCvs() {
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
        <Eyebrow>Jobs & CVs</Eyebrow>
        <h2 className="text-3xl sm:text-4xl">Students and graduates: get seen, get hired.</h2>
        <p className="text-muted-foreground">Build a free profile in five minutes, download your CV, and apply to jobs in Sodo with one tap. Or let our team write a professional CV for you.</p>
      </Reveal>
      <div className="grid gap-4 md:grid-cols-3">
        {free.map((x, i) => (
          <Reveal key={x.title} delay={i * 100}>
            <div className="h-full rounded-2xl border bg-card p-5 transition hover:-translate-y-1 hover:shadow-lg">
              <span className="grid size-11 place-items-center rounded-xl bg-accent text-primary"><x.icon className="size-5" /></span>
              <p className="mt-4 font-bold">{x.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{x.text}</p>
            </div>
          </Reveal>
        ))}
      </div>
      {f.on('cv_service') && (
        <Reveal>
          <div className="space-y-6 rounded-3xl border bg-card p-5 sm:p-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="space-y-1">
                <Eyebrow>Professional CV service</Eyebrow>
                <p className="text-2xl font-extrabold">Send us your details. We write your CV.</p>
                <p className="text-sm text-muted-foreground">Written and designed by our team, in English or Amharic. PDF and Word. {f.number('student_discount')}% off for verified students.</p>
              </div>
              <Button asChild className="rounded-full bg-market text-[#13201A] hover:bg-market/90"><Link to="/work/cv">Order my CV</Link></Button>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {packages.map((p) => (
                <div key={p.name} className={cn('relative rounded-2xl border p-5', p.popular && 'border-primary ring-2 ring-primary/15')}>
                  {p.popular && <span className="absolute -top-3 left-5 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold text-primary-foreground">MOST CHOSEN</span>}
                  <p className="font-bold">{p.name}</p>
                  <p className="mt-1"><span className="text-3xl font-extrabold">{p.price}</span> <span className="text-sm text-muted-foreground">birr · ready in {p.days}</span></p>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {p.points.map((t) => <li key={t} className="flex gap-2"><BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" /> {t}</li>)}
                  </ul>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              Need it fast? Add 24-hour express for {f.number('cv_express_fee')} birr.{f.on('job_posts') && <> Hiring? <Link to="/work/post" className="font-semibold text-primary hover:underline">Post your first job free</Link>.</>}
            </p>
          </div>
        </Reveal>
      )}
      <Reveal className="flex flex-wrap justify-center gap-3">
        <Button asChild size="lg" className="rounded-full"><Link to="/work/profile">Make my free profile</Link></Button>
        <Button asChild size="lg" variant="outline" className="rounded-full"><Link to="/work">See jobs in Sodo</Link></Button>
      </Reveal>
    </section>
  )
}

function ForSellers() {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
      <Reveal>
        <div className="grid items-center gap-8 overflow-hidden rounded-3xl bg-amber-soft p-6 sm:p-10 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-4">
            <Eyebrow>For sellers</Eyebrow>
            <h2 className="text-3xl sm:text-4xl">Start free. Sell to all of Sodo.</h2>
            <p className="text-muted-foreground">Open your shop in a minute, or sell a few things of your own. Buyers find you, chat with you and call you.</p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="rounded-full"><Link to="/sell"><Store /> Start selling</Link></Button>
            </div>
          </div>
          <ul className="grid gap-3 text-sm">
            {[
              ['Free to post', 'Add photos, a price and the area. Show your products to buyers across Sodo.'],
              ['Verified badge', 'Send your ID once; buyers trust the badge.'],
              ['Chats and calls', 'Buyers message you in the app or call you directly.'],
            ].map(([t, d]) => (
              <li key={t} className="rounded-2xl bg-card p-4"><p className="font-semibold">{t}</p><p className="text-muted-foreground">{d}</p></li>
            ))}
          </ul>
        </div>
      </Reveal>
    </section>
  )
}

function Faq({ payments }: { payments: boolean }) {
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
        <Eyebrow>Questions</Eyebrow>
        <h2 className="text-3xl sm:text-4xl">Good to know</h2>
      </Reveal>
      <Reveal>
        <Accordion type="single" collapsible className="rounded-2xl border bg-card px-5">
          {items.map((f) => (
            <AccordionItem key={f.q} value={f.q}>
              <AccordionTrigger className="text-left font-semibold">{f.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Reveal>
    </section>
  )
}

function FinalCall() {
  const signedIn = useSession((s) => !!s.session)
  return (
    <section className="px-4 pb-24 sm:px-6">
      <Reveal>
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl bg-[#0E5A43] px-6 py-14 text-center text-white sm:py-20">
          <LogoSymbol onDark className="pointer-events-none absolute -right-10 -top-10 h-64 w-auto opacity-10" />
          <p className="font-ethiopic text-sm text-white/70">ሶዶ ገበያ · ይግዙ · ይሽጡ · ይቅጠሩ</p>
          <h2 className="mx-auto mt-3 max-w-2xl text-3xl sm:text-5xl">Join Sodo's own market today. It's free.</h2>
          <p className="mt-3 text-white/75">Sign up with your phone number. One SMS code, and you're in.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {!signedIn && (
              <Button asChild size="lg" className="rounded-full bg-market text-[#13201A] hover:bg-market/90"><Link to="/register">Create free account</Link></Button>
            )}
            <Button asChild size="lg" variant="outline" className="rounded-full border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white">
              <Link to="/sell">Start selling</Link>
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
      <Categories jobsOn={jobsOn} />
      <HowItWorks payments={features.payments} />
      <Fresh />
      <Workers />
      <JobsAndCvs />
      <ForSellers />
      <Faq payments={features.payments} />
      <FinalCall />
    </>
  )
}
