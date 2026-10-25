import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { BadgeCheck, Briefcase, Hammer, MapPin, Search, Wrench } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'

import { Stars } from '@/components/reviews'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api'
import { formatETB } from '@/lib/format'
import { servicesApi, TRADE_LABEL, TRADES, type ProCard, type Trade } from '@/lib/services-api'
import { cn } from '@/lib/utils'
import { NotFoundPage } from './not-found'
import { initials } from './chats'

function ProCardView({ p }: { p: ProCard }) {
  return (
    <Link to={`/pros/${p.id}`} className="flex gap-3 rounded-2xl border bg-card p-3 transition hover:border-primary/40 hover:shadow-sm">
      <span className="grid size-14 shrink-0 place-items-center rounded-full bg-accent text-lg font-extrabold text-accent-foreground">{initials(p.displayName)}</span>
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="flex items-center gap-1.5 font-bold">
          <span className="truncate">{p.displayName}</span>
          <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Approved by Sodo Gebeya" />
        </span>
        <span className="block text-sm text-muted-foreground">
          {TRADE_LABEL[p.trade]} · {p.jobsDone} job{p.jobsDone === 1 ? '' : 's'} done
        </span>
        <span className="flex flex-wrap items-center gap-x-2 text-sm">
          {p.rating !== null ? <><Stars value={p.rating} /> <strong>{p.rating.toFixed(1)}</strong></> : <span className="text-muted-foreground">New</span>}
          {p.priceFrom !== null && <span className="text-muted-foreground">· from {formatETB(p.priceFrom)}</span>}
        </span>
        {p.areas && <span className="flex items-center gap-1 truncate text-xs text-muted-foreground"><MapPin className="size-3" /> {p.areas}</span>}
      </span>
    </Link>
  )
}

/** Hire a pro (design S7): trades, search, approved pros. */
export function ServicesPage() {
  const [params, setParams] = useSearchParams()
  const trade = (params.get('trade') as Trade | null) ?? undefined
  const [q, setQ] = useState(params.get('q') ?? '')
  const { data, isLoading } = useQuery({
    queryKey: ['pros', trade, params.get('q')],
    queryFn: () => servicesApi.pros({ trade, q: params.get('q') ?? undefined }),
    placeholderData: keepPreviousData,
  })
  const set = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams(params)
    Object.entries(next).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)))
    setParams(p, { replace: true })
  }
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">Hire a pro</h1>
        <p className="text-sm text-muted-foreground">Approved local workers in Wolaita Sodo · <span className="font-ethiopic">አገልግሎቶች</span></p>
      </div>
      <form role="search" className="flex h-12 items-center gap-2 rounded-2xl border bg-card pl-4 pr-1.5" onSubmit={(e) => { e.preventDefault(); set({ q: q.trim() || undefined }) }}>
        <Search className="size-5 text-muted-foreground" aria-hidden />
        <label htmlFor="pro-search" className="sr-only">Search pros</label>
        <input id="pro-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, skill or area" className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" />
        <Button type="submit" className="h-9 rounded-xl">Search</Button>
      </form>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Trade">
        <Button size="sm" variant={!trade ? 'default' : 'outline'} className="h-9 rounded-full" aria-pressed={!trade} onClick={() => set({ trade: undefined })}>All</Button>
        {TRADES.map((t) => (
          <Button key={t} size="sm" variant={trade === t ? 'default' : 'outline'} className="h-9 rounded-full" aria-pressed={trade === t} onClick={() => set({ trade: t })}>
            {TRADE_LABEL[t]}
          </Button>
        ))}
      </div>
      <Link to={`/jobs/new${trade ? `?trade=${trade}` : ''}`} className="flex items-center gap-4 rounded-2xl bg-foreground p-4 text-background">
        <Hammer className="size-8 shrink-0" />
        <span className="flex-1">
          <span className="block font-bold">Not sure who to call?</span>
          <span className="block text-sm opacity-80">Describe the job once and get prices from several pros. Free to ask.</span>
        </span>
        <span className="rounded-xl bg-warning px-3 py-2 text-sm font-bold text-[#13201A]">Get quotes</span>
      </Link>
      <div className="grid gap-3 sm:grid-cols-2">
        {isLoading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        {data?.content.map((p) => <ProCardView key={p.id} p={p} />)}
        {data?.content.length === 0 && (
          <p className="col-span-full rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            No approved pros {trade ? `for ${TRADE_LABEL[trade].toLowerCase()}` : ''} yet. Post a job and we’ll find someone.
          </p>
        )}
      </div>
      <Link to="/pro" className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-sm hover:border-primary/40">
        <Briefcase className="size-5 text-brand" />
        <span><strong>Are you skilled?</strong> Create a free pro profile and get jobs in Sodo.</span>
      </Link>
    </div>
  )
}

/** A pro's public profile (design S8). */
export function ProProfilePage() {
  const { id } = useParams()
  const { data: p, error, isLoading } = useQuery({ queryKey: ['pro', id], queryFn: () => servicesApi.pro(Number(id)) })
  if (error instanceof ApiError && error.status === 404) return <NotFoundPage />
  if (isLoading || !p) return <div className="mx-auto max-w-3xl p-6"><Skeleton className="h-64 rounded-3xl" /></div>
  const c = p.card
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      <div className="overflow-hidden rounded-3xl border bg-card">
        <div className="h-24 bg-primary" />
        <div className="space-y-3 px-5 pb-5">
          <span className="-mt-10 grid size-20 place-items-center rounded-full border-4 border-card bg-accent text-2xl font-extrabold text-accent-foreground">{initials(c.displayName)}</span>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-extrabold">{c.displayName} <BadgeCheck className="size-5 text-primary" aria-label="Approved" /></h1>
            <p className="text-muted-foreground">{TRADE_LABEL[c.trade]}{c.yearsExperience ? ` · ${c.yearsExperience} years` : ''}{c.areas ? ` · ${c.areas}` : ''}</p>
            {c.headline && <p className="mt-1 text-sm">{c.headline}</p>}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl border p-2"><p className="text-lg font-extrabold">{c.rating?.toFixed(1) ?? 'New'}</p><p className="text-xs text-muted-foreground">{c.ratingCount} rating{c.ratingCount === 1 ? '' : 's'}</p></div>
            <div className="rounded-xl border p-2"><p className="text-lg font-extrabold">{c.jobsDone}</p><p className="text-xs text-muted-foreground">jobs done</p></div>
            <div className="rounded-xl border p-2"><p className="text-lg font-extrabold">{c.priceFrom ? formatETB(c.priceFrom) : '—'}</p><p className="text-xs text-muted-foreground">from</p></div>
          </div>
          {p.status && p.status !== 'APPROVED' && (
            <p className="rounded-lg bg-warning/20 p-2 text-sm">Only you can see this: status {p.status.toLowerCase()}{p.statusNote ? `. ${p.statusNote}` : ''}</p>
          )}
        </div>
      </div>
      {p.bio && <section className="space-y-2"><h2 className="font-bold">About</h2><p className="whitespace-pre-wrap text-sm leading-relaxed">{p.bio}</p></section>}
      {p.prices.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-bold">Prices</h2>
          <ul className="divide-y rounded-2xl border bg-card">
            {p.prices.map((l) => (
              <li key={l.label} className="flex justify-between gap-3 px-4 py-3 text-sm"><span>{l.label}</span><strong className="shrink-0">{l.priceFrom ? `from ${formatETB(l.priceFrom)}` : 'Ask for a quote'}</strong></li>
            ))}
          </ul>
        </section>
      )}
      {p.photos.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-bold">Past work</h2>
          <div className="grid grid-cols-3 gap-2">{p.photos.map((ph) => <img key={ph.id} src={ph.url} alt="Past work" className={cn('aspect-square w-full rounded-xl object-cover')} />)}</div>
        </section>
      )}
      <div className="sticky bottom-20 md:bottom-4">
        <Button asChild size="lg" className="h-12 w-full text-base shadow-lg">
          <Link to={`/jobs/new?pro=${c.id}&trade=${c.trade}`}><Wrench /> Request a job</Link>
        </Button>
      </div>
    </div>
  )
}
