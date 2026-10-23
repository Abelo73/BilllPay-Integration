import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Coffee,
  CreditCard,
  Headphones,
  Lamp,
  Lock,
  RotateCcw,
  Shirt,
  ShoppingBag,
  Star,
  Truck,
  Wallet,
  Wheat,
} from 'lucide-react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import { ProductCard } from '@/components/product-card'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'

const CATEGORIES = [
  { slug: 'coffee-tea', name: 'Coffee & Tea', icon: Coffee, blurb: 'Single origin, roasted fresh', image: '/products/yirgacheffe-beans.jpg' },
  { slug: 'fashion', name: 'Fashion', icon: Shirt, blurb: 'Hand-woven & leather goods', image: '/products/habesha-netela.jpg' },
  { slug: 'electronics', name: 'Electronics', icon: Headphones, blurb: 'Gadgets that keep up', image: '/products/wireless-earbuds-pro.jpg' },
  { slug: 'home-living', name: 'Home & Living', icon: Lamp, blurb: 'Pieces with a story', image: '/products/woven-mesob.jpg' },
  { slug: 'pantry', name: 'Pantry', icon: Wheat, blurb: 'Honey, spices & more', image: '/products/berbere-spice.jpg' },
]

const HERO_TILES = [
  { src: '/products/clay-jebena.jpg', alt: 'Coffee poured from a clay jebena' },
  { src: '/products/habesha-netela.jpg', alt: 'Women in traditional habesha dress' },
  { src: '/products/woven-mesob.jpg', alt: 'Colourful hand-woven basket' },
  { src: '/products/yirgacheffe-beans.jpg', alt: 'Roasted coffee beans in a burlap sack' },
]

const STEPS = [
  { icon: ShoppingBag, title: 'Pick your favourites', text: 'Browse curated Ethiopian goods and everyday essentials.' },
  { icon: Lock, title: 'Pay securely with BillPay', text: 'Wallet, bank or card on BillPay’s hosted checkout. We never see your details.' },
  { icon: Truck, title: 'Delivered to your door', text: 'Confirmed instantly once BillPay verifies your payment.' },
]

const TESTIMONIALS = [
  { name: 'Hanna T.', role: 'Bole, Addis Ababa', quote: 'The Yirgacheffe beans are the best I have had outside a ceremony. Paying by wallet took seconds.' },
  { name: 'Dawit M.', role: 'CMC, Addis Ababa', quote: 'Clear order tracking and the payment confirmation came right away. Exactly how online shopping should feel.' },
  { name: 'Selam G.', role: 'Hawassa', quote: 'Beautiful netela, carefully packed. I liked that I could pay with my bank account directly.' },
]

const FAQ = [
  { q: 'Which payment methods can I use?', a: 'All payments go through BillPay. You can pay with a mobile wallet, a bank account or a card on BillPay’s secure hosted page.' },
  { q: 'Is my payment information safe?', a: 'Yes. You enter your payment details on BillPay, never on TenaShop. We only receive a confirmation that the payment succeeded.' },
  { q: 'What if I close the page during payment?', a: 'Your order is saved. Use “Track order” with your order number and phone to see its status or retry the payment.' },
  { q: 'How do refunds work?', a: 'Approved refunds are sent back through BillPay to the method you paid with.' },
  { q: 'Is this a real store?', a: 'TenaShop is a demo store for testing the BillPay integration. In sandbox mode no real money moves.' },
]

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
      <div className="absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-brand/20 blur-3xl" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-2 lg:pt-24">
        <div className="space-y-8">
          <Badge variant="outline" className="gap-1.5 rounded-full px-3 py-1 text-xs">
            <span className="size-1.5 rounded-full bg-success" /> Now accepting BillPay Wallet, Bank & Card
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Ethiopian craft,{' '}
            <span className="bg-gradient-to-r from-brand to-primary bg-clip-text text-transparent dark:to-chart-2">
              delivered
            </span>{' '}
            with one tap checkout.
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground text-pretty">
            From Yirgacheffe coffee to hand-woven netela, shop what you love and pay securely with BillPay in seconds.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" className="h-11 px-6 text-base">
              <Link to="/shop">
                Shop now <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-11 px-6 text-base">
              <a href="#how-it-works">How it works</a>
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><BadgeCheck className="size-4 text-success" /> Verified payments</span>
            <span className="flex items-center gap-1.5"><Truck className="size-4 text-success" /> Fast delivery</span>
            <span className="flex items-center gap-1.5"><RotateCcw className="size-4 text-success" /> Easy refunds</span>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-lg">
          <div className="grid grid-cols-2 gap-5 pb-10">
            {HERO_TILES.map((t, i) => (
              <img
                key={t.src}
                src={t.src}
                alt={t.alt}
                className={`aspect-square w-full rounded-3xl object-cover shadow-xl ring-1 ring-black/5 ${i % 2 ? 'translate-y-10' : ''}`}
                fetchPriority={i < 2 ? 'high' : undefined}
              />
            ))}
          </div>
          <div className="absolute -bottom-4 left-1/2 w-72 -translate-x-1/2 rounded-2xl border bg-card/95 p-4 shadow-2xl backdrop-blur sm:left-auto sm:right-[-1rem] sm:translate-x-0">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-full bg-success/15">
                <CheckCircle2 className="size-5 text-success" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">Payment confirmed</p>
                <p className="truncate text-xs text-muted-foreground">ETB 1,450.00 · BillPay Wallet</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function PaymentStrip() {
  const methods = [
    { icon: Wallet, label: 'BillPay Wallet' },
    { icon: Building2, label: 'Bank transfer' },
    { icon: CreditCard, label: 'Debit & credit card' },
    { icon: Lock, label: 'Hosted secure checkout' },
  ]
  return (
    <section className="border-y bg-muted/40">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-10 gap-y-4 px-4 py-6 sm:px-6">
        <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Payments by BillPay</span>
        {methods.map((m) => (
          <span key={m.label} className="flex items-center gap-2 text-sm font-medium">
            <m.icon className="size-4 text-brand" /> {m.label}
          </span>
        ))}
      </div>
    </section>
  )
}

function SectionHeading({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return (
    <div className="mx-auto max-w-2xl space-y-3 text-center">
      <p className="text-sm font-medium text-brand">{eyebrow}</p>
      <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {text && <p className="text-muted-foreground">{text}</p>}
    </div>
  )
}

function Categories() {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-24 sm:px-6">
      <SectionHeading eyebrow="Categories" title="Shop by what you love" />
      <div className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-5">
        {CATEGORIES.map((c) => (
          <Link
            key={c.slug}
            to={`/shop?category=${c.slug}`}
            className="group relative aspect-[4/5] overflow-hidden rounded-2xl bg-muted shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <img
              src={c.image}
              alt=""
              loading="lazy"
              className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-4 text-white">
              <span className="mb-2 grid size-8 place-items-center rounded-lg bg-white/15 backdrop-blur">
                <c.icon className="size-4" />
              </span>
              <p className="font-medium">{c.name}</p>
              <p className="text-xs text-white/75">{c.blurb}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

function Featured() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['featured'], queryFn: api.featured })
  return (
    <section className="mx-auto max-w-7xl px-4 pt-24 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="text-sm font-medium text-brand">Featured</p>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Customer favourites</h2>
        </div>
        <Button asChild variant="outline">
          <Link to="/shop">
            View all <ArrowRight />
          </Link>
        </Button>
      </div>
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading &&
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="aspect-[4/4] rounded-2xl" />)}
        {isError && (
          <p className="col-span-full rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Products could not be loaded. Is the backend running on port 8181?
          </p>
        )}
        {data?.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </section>
  )
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-7xl scroll-mt-20 px-4 pt-24 sm:px-6">
      <SectionHeading eyebrow="How it works" title="From cart to doorstep in three steps" />
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <div key={s.title} className="relative rounded-2xl border bg-card p-6">
            <span className="absolute right-6 top-6 text-5xl font-semibold text-muted/80 dark:text-muted">0{i + 1}</span>
            <div className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground">
              <s.icon className="size-5" />
            </div>
            <h3 className="mt-5 font-semibold">{s.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function Testimonials() {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-24 sm:px-6">
      <SectionHeading eyebrow="Reviews" title="Loved across Ethiopia" />
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {TESTIMONIALS.map((t) => (
          <figure key={t.name} className="flex flex-col rounded-2xl border bg-card p-6">
            <div className="flex gap-0.5 text-warning">
              {Array.from({ length: 5 }).map((_, i) => <Star key={i} className="size-4 fill-current" />)}
            </div>
            <blockquote className="mt-4 flex-1 text-pretty">“{t.quote}”</blockquote>
            <figcaption className="mt-6 flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                {t.name[0]}
              </span>
              <span>
                <span className="block text-sm font-medium">{t.name}</span>
                <span className="block text-xs text-muted-foreground">{t.role}</span>
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}

function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 pt-24 sm:px-6">
      <SectionHeading eyebrow="FAQ" title="Questions, answered" />
      <Accordion type="single" collapsible className="mt-10">
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

function Newsletter() {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-24 sm:px-6">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[oklch(0.30_0.10_262)] to-[oklch(0.22_0.08_265)] px-6 py-14 text-white ring-1 ring-white/10 sm:px-12">
        <div className="absolute -right-20 -top-20 size-72 rounded-full bg-brand/40 blur-3xl" />
        <div className="relative grid items-center gap-8 md:grid-cols-2">
          <div className="space-y-3">
            <h2 className="text-3xl font-semibold tracking-tight">Get first dibs on new arrivals</h2>
            <p className="text-white/75">Fresh roasts, limited crafts and member-only offers. No spam.</p>
          </div>
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault()
              e.currentTarget.reset()
              toast.success('Thanks! You’re on the list.')
            }}
          >
            <Input
              type="email"
              required
              placeholder="you@example.et"
              aria-label="Email address"
              className="h-11 border-white/20 bg-white/10 text-white placeholder:text-white/50"
            />
            <Button type="submit" size="lg" className="h-11 bg-white px-6 text-[oklch(0.30_0.10_262)] hover:bg-white/90">
              Subscribe
            </Button>
          </form>
        </div>
      </div>
    </section>
  )
}

export function HomePage() {
  return (
    <>
      <Hero />
      <PaymentStrip />
      <Categories />
      <Featured />
      <HowItWorks />
      <Testimonials />
      <Faq />
      <Newsletter />
    </>
  )
}
