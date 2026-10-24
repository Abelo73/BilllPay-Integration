import { useQuery } from '@tanstack/react-query'
import {
  Armchair,
  ArrowRight,
  Bike,
  CookingPot,
  Droplet,
  Footprints,
  Lock,
  type LucideIcon,
  Package,
  Search,
  Shirt,
  ShoppingBag,
  Smartphone,
  Store,
  Tag,
  Truck,
  Wheat,
  Coffee,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { ProductCard } from '@/components/product-card'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

/** Category icon by slug keyword; categories are managed in the admin, so unknown ones get a tag. */
const ICONS: [RegExp, LucideIcon][] = [
  [/cloth|fashion|dress|wear/, Shirt],
  [/shoe|sandal|boot/, Footprints],
  [/phone|electronic|gadget|computer/, Smartphone],
  [/furniture|sofa|home|living/, Armchair],
  [/kitchen|cook/, CookingPot],
  [/beauty|cosmetic|hair/, Droplet],
  [/vehicle|bike|motor|car|part/, Bike],
  [/coffee|tea/, Coffee],
  [/food|pantry|spice|grain/, Wheat],
  [/used|second/, Tag],
]
const iconFor = (slug: string) => ICONS.find(([re]) => re.test(slug))?.[1] ?? ShoppingBag

const STEPS = [
  { icon: Search, title: 'Find it in Sodo', text: 'Search shops and sellers in town by name, category or price.' },
  { icon: Lock, title: 'Pay with BillPay', text: 'Mobile wallet or bank on BillPay’s secure page. We never see your details.' },
  { icon: Truck, title: 'Delivered in town', text: 'The seller packs your order and it comes to your door, or pick it up.' },
]

const FAQ = [
  { q: 'Which payment methods can I use?', a: 'All online payments go through BillPay: a mobile wallet or a bank account on BillPay’s secure page.' },
  { q: 'Is my payment information safe?', a: 'Yes. You enter your payment details on BillPay, never on Sodo Gebeya. We only receive a confirmation that the payment succeeded.' },
  { q: 'What if I close the page while paying?', a: 'Your order is saved and your items are held for 30 minutes. Open “Orders” to finish paying, or try again.' },
  { q: 'How do refunds work?', a: 'Approved refunds are sent back through BillPay to the method you paid with.' },
  { q: 'Can I sell on Sodo Gebeya?', a: 'Soon. Shops and individuals in Wolaita Sodo will be able to open a shop or post used items. Create an account now and we’ll let you know.' },
]

function SearchBox() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  return (
    <form
      role="search"
      className="flex h-12 items-center gap-2 rounded-2xl border bg-card pl-4 pr-1.5 shadow-sm focus-within:border-primary"
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
        placeholder="Search clothes, phones, furniture…"
        className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
      />
      <Button type="submit" className="h-9 rounded-xl px-4">Search</Button>
    </form>
  )
}

function Hero() {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 md:pt-12">
      <div className="grid items-center gap-6 md:grid-cols-[1.2fr_1fr] md:gap-12">
        <div className="space-y-4 md:space-y-6">
          <div className="space-y-2">
            <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-balance md:text-5xl">
              Buy and sell in <span className="text-brand">Wolaita Sodo</span>
            </h1>
            <p className="font-ethiopic text-sm text-muted-foreground md:text-base">በወላይታ ሶዶ ይግዙ፣ ይሽጡ</p>
          </div>
          <p className="hidden max-w-lg text-lg text-muted-foreground md:block">
            Clothes, shoes, phones, furniture and more from shops and people in town. Pay with BillPay, get it delivered.
          </p>
          <SearchBox />
        </div>
        <div className="hidden grid-cols-2 gap-4 md:grid">
          {['/products/habesha-netela.jpg', '/products/leather-tote.jpg', '/products/canvas-sneakers.jpg', '/products/woven-mesob.jpg'].map((src, i) => (
            <img key={src} src={src} alt="" className={cn('aspect-square w-full rounded-3xl object-cover ring-1 ring-black/5', i % 2 && 'translate-y-6')} />
          ))}
        </div>
      </div>
    </section>
  )
}

function Categories() {
  const { data, isLoading } = useQuery({ queryKey: ['categories'], queryFn: api.categories, staleTime: 5 * 60_000 })
  return (
    <section aria-labelledby="cats" className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 md:pt-16">
      <div className="flex items-baseline justify-between">
        <h2 id="cats" className="text-lg font-bold md:text-2xl">Categories</h2>
        <Link to="/shop" className="text-sm font-semibold text-brand hover:underline">See all</Link>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-8">
        {isLoading && Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-2xl" />)}
        {data?.map((c, i) => {
          const Icon = iconFor(c.slug)
          return (
            <Link key={c.slug} to={`/shop?category=${c.slug}`} className="group flex flex-col items-center gap-1.5 text-center">
              <span
                className={cn(
                  'grid size-14 place-items-center rounded-2xl transition group-hover:scale-105 md:size-16',
                  i % 2 ? 'bg-amber-soft text-amber-ink' : 'bg-accent text-accent-foreground',
                )}
              >
                <Icon className="size-6 md:size-7" strokeWidth={1.8} />
              </span>
              <span className="line-clamp-2 text-xs font-semibold leading-tight">{c.name}</span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function SellBanner() {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 md:pt-12">
      <div className="flex flex-col gap-4 rounded-3xl bg-primary p-5 text-primary-foreground sm:flex-row sm:items-center md:p-8">
        <span className="hidden size-14 shrink-0 place-items-center rounded-2xl bg-white/15 sm:grid">
          <Store className="size-7" />
        </span>
        <div className="flex-1 space-y-1">
          <p className="text-lg font-bold md:text-xl">Sell on Sodo Gebeya</p>
          <p className="text-sm text-primary-foreground/85">
            Shops and individuals can soon open a shop or post used items, free for the first 3 months. Create your account to be first.
          </p>
        </div>
        <Button asChild size="lg" variant="secondary" className="h-11 shrink-0 bg-white text-primary hover:bg-white/90">
          <Link to="/register">Get ready to sell</Link>
        </Button>
      </div>
    </section>
  )
}

function Fresh() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['featured'], queryFn: api.featured })
  return (
    <section aria-labelledby="fresh" className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 md:pt-16">
      <div className="flex items-baseline justify-between">
        <h2 id="fresh" className="text-lg font-bold md:text-2xl">Popular in Sodo</h2>
        <Link to="/shop" className="flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
          More <ArrowRight className="size-4" />
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        {isLoading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="aspect-[3/4] rounded-2xl" />)}
        {isError && (
          <p className="col-span-full rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Products could not be loaded right now. Please try again in a moment.
          </p>
        )}
        {data?.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </section>
  )
}

function HowItWorks() {
  return (
    <section aria-labelledby="how" className="mx-auto max-w-7xl px-4 pt-12 sm:px-6 md:pt-20">
      <h2 id="how" className="text-lg font-bold md:text-2xl">How it works</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3 md:gap-5">
        {STEPS.map((s) => (
          <div key={s.title} className="flex gap-4 rounded-2xl border bg-card p-4 md:flex-col md:p-6">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
              <s.icon className="size-5" />
            </span>
            <div className="space-y-1">
              <h3 className="font-bold">{s.title}</h3>
              <p className="text-sm text-muted-foreground">{s.text}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3 rounded-2xl border bg-card p-4 text-sm">
        <Package className="size-5 shrink-0 text-brand" />
        <span>
          Already ordered? <Link to="/orders/track" className="font-semibold text-brand hover:underline">Track your order</Link>
        </span>
      </div>
    </section>
  )
}

function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="mx-auto max-w-3xl scroll-mt-20 px-4 pt-12 sm:px-6 md:pt-20">
      <h2 id="faq-title" className="text-lg font-bold md:text-2xl">Questions</h2>
      <Accordion type="single" collapsible className="mt-2">
        {FAQ.map((f, i) => (
          <AccordionItem key={f.q} value={`item-${i}`}>
            <AccordionTrigger className="text-base">{f.q}</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  )
}

export function HomePage() {
  return (
    <>
      <Hero />
      <Categories />
      <Fresh />
      <SellBanner />
      <HowItWorks />
      <Faq />
    </>
  )
}
