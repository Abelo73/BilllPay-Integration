import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, Loader2, Plus, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/lib/api'
import { formatDate, formatETB } from '@/lib/format'
import { servicesApi, TRADE_LABEL, TRADES, type PriceLine, type ProDetail, type Trade } from '@/lib/services-api'
import { useSession } from '@/store/session'

function ProfileForm({ existing }: { existing: ProDetail | null }) {
  const qc = useQueryClient()
  const session = useSession((s) => s.session)
  const [f, setF] = useState({
    displayName: existing?.card.displayName ?? session?.user.fullName ?? '',
    trade: (existing?.card.trade ?? 'ELECTRICIAN') as Trade,
    headline: existing?.card.headline ?? '',
    bio: existing?.bio ?? '',
    yearsExperience: existing?.card.yearsExperience?.toString() ?? '',
    areas: existing?.card.areas ?? '',
    phone: existing?.phone ?? session?.user.phone ?? '',
  })
  const [prices, setPrices] = useState<{ label: string; price: string }[]>(
    existing?.prices.map((p) => ({ label: p.label, price: p.priceFrom?.toString() ?? '' })) ?? [{ label: '', price: '' }],
  )
  const save = useMutation({
    mutationFn: () =>
      servicesApi.saveMyPro({
        ...f,
        yearsExperience: f.yearsExperience ? Number(f.yearsExperience) : null,
        prices: prices.filter((p) => p.label.trim()).map((p): PriceLine => ({ label: p.label, priceFrom: p.price ? Number(p.price) : null })),
      }),
    onSuccess: () => {
      toast.success(existing ? 'Profile saved' : 'Profile sent for approval. We’ll text you.')
      qc.invalidateQueries({ queryKey: ['my-pro'] })
    },
    onError: (e) => toast.error(e.message),
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="p-name">Name customers see</Label><Input id="p-name" required maxLength={120} value={f.displayName} onChange={set('displayName')} className="h-11" /></div>
        <div className="space-y-1.5">
          <Label htmlFor="p-trade">Trade</Label>
          <select id="p-trade" value={f.trade} onChange={set('trade')} className="h-11 w-full rounded-xl border bg-card px-3">
            {TRADES.map((t) => <option key={t} value={t}>{TRADE_LABEL[t]}</option>)}
          </select>
        </div>
        <div className="space-y-1.5"><Label htmlFor="p-phone">Phone for customers</Label><Input id="p-phone" required type="tel" value={f.phone} onChange={set('phone')} placeholder="0911 234 567" className="h-11" /><p className="text-xs text-muted-foreground">Shared only after a customer accepts your price.</p></div>
        <div className="space-y-1.5"><Label htmlFor="p-years">Years of experience</Label><Input id="p-years" inputMode="numeric" value={f.yearsExperience} onChange={(e) => setF({ ...f, yearsExperience: e.target.value.replace(/\D/g, '').slice(0, 2) })} className="h-11" /></div>
      </div>
      <div className="space-y-1.5"><Label htmlFor="p-headline">One-line summary</Label><Input id="p-headline" maxLength={160} value={f.headline} onChange={set('headline')} placeholder="House wiring, sockets, meter boxes" className="h-11" /></div>
      <div className="space-y-1.5"><Label htmlFor="p-areas">Where you work</Label><Input id="p-areas" maxLength={300} value={f.areas} onChange={set('areas')} placeholder="Sodo town, Boditi road" className="h-11" /></div>
      <div className="space-y-1.5"><Label htmlFor="p-bio">About you</Label><Textarea id="p-bio" rows={3} maxLength={2000} value={f.bio} onChange={set('bio')} /></div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Prices (leave the price empty for “ask for a quote”)</legend>
        {prices.map((p, i) => (
          <div key={i} className="flex gap-2">
            <Input aria-label="Service" placeholder="Install a socket" maxLength={120} value={p.label} onChange={(e) => setPrices(prices.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className="h-10 flex-1" />
            <Input aria-label="From price in ETB" placeholder="ETB" inputMode="numeric" value={p.price} onChange={(e) => setPrices(prices.map((x, j) => (j === i ? { ...x, price: e.target.value.replace(/\D/g, '') } : x)))} className="h-10 w-28" />
            <Button type="button" variant="ghost" size="icon" className="size-10" aria-label="Remove line" onClick={() => setPrices(prices.filter((_, j) => j !== i))}><Trash2 /></Button>
          </div>
        ))}
        {prices.length < 12 && <Button type="button" size="sm" variant="outline" onClick={() => setPrices([...prices, { label: '', price: '' }])}><Plus /> Add a price</Button>}
      </fieldset>
      <Button type="submit" size="lg" className="h-12 w-full" disabled={save.isPending}>{save.isPending && <Loader2 className="animate-spin" />} {existing ? 'Save profile' : 'Create my pro profile'}</Button>
    </form>
  )
}

function Photos({ pro }: { pro: ProDetail }) {
  const qc = useQueryClient()
  const ref = useRef<HTMLInputElement>(null)
  const add = useMutation({ mutationFn: (f: File) => servicesApi.addProPhoto(f), onSuccess: () => qc.invalidateQueries({ queryKey: ['my-pro'] }), onError: (e) => toast.error(e.message) })
  const del = useMutation({ mutationFn: (id: number) => servicesApi.deleteProPhoto(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['my-pro'] }) })
  return (
    <section className="space-y-2">
      <h2 className="font-bold">Photos of your work (up to 6)</h2>
      <div className="flex flex-wrap gap-2">
        {pro.photos.map((p) => (
          <div key={p.id} className="relative">
            <img src={p.url} alt="Past work" className="size-24 rounded-xl object-cover" />
            <button type="button" aria-label="Delete photo" className="absolute right-1 top-1 grid size-8 place-items-center rounded-full bg-card/90" onClick={() => del.mutate(p.id)}><Trash2 className="size-4" /></button>
          </div>
        ))}
        {pro.photos.length < 6 && (
          <button type="button" aria-label="Add photo" className="grid size-24 place-items-center rounded-xl border-2 border-dashed text-muted-foreground" disabled={add.isPending} onClick={() => ref.current?.click()}>
            {add.isPending ? <Loader2 className="animate-spin" /> : <Camera />}
          </button>
        )}
        <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) add.mutate(f); e.target.value = '' }} />
      </div>
    </section>
  )
}

function Inbox() {
  const { data, error } = useQuery({ queryKey: ['pro-inbox'], queryFn: () => servicesApi.proInbox(), refetchInterval: 20_000 })
  if (error instanceof ApiError && error.code === 'NOT_A_PRO') return null
  if (!data) return null
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">Jobs for you</h2>
      {data.open.length === 0 && <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">No open jobs right now. We text you when someone asks you directly.</p>}
      {data.open.map((j) => (
        <Link key={j.id} to={`/jobs/${j.id}`} className="block space-y-1 rounded-2xl border bg-card p-4 hover:border-primary/40">
          <span className="flex justify-between text-sm"><strong>{j.direct ? 'Asked you directly' : TRADE_LABEL[j.trade]}</strong><span className="text-muted-foreground">{formatDate(j.createdAt)}</span></span>
          <span className="line-clamp-2 block text-sm">{j.description}</span>
          <span className="text-xs text-muted-foreground">{j.area}{j.budget ? ` · budget ${formatETB(j.budget)}` : ''} · {j.quoteCount} price{j.quoteCount === 1 ? '' : 's'} so far</span>
        </Link>
      ))}
      {data.quoted.content.length > 0 && (
        <>
          <h3 className="pt-2 font-bold">Your prices</h3>
          {data.quoted.content.map((j) => (
            <Link key={j.id} to={`/jobs/${j.id}`} className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-3 text-sm hover:border-primary/40">
              <span className="min-w-0 truncate">{j.description}</span>
              <span className="shrink-0 font-semibold">{j.myQuote ? `${formatETB(j.myQuote.price)} · ${j.myQuote.status.toLowerCase()}` : ''}</span>
            </Link>
          ))}
        </>
      )}
    </section>
  )
}

/** For skilled workers: create the pro profile, add photos, see jobs and send prices. */
export function ProDashboardPage() {
  const session = useSession((s) => s.session)
  const { data, isLoading } = useQuery({ queryKey: ['my-pro'], queryFn: servicesApi.myPro, enabled: !!session })
  const [editing, setEditing] = useState(false)
  if (!session) return <Navigate to="/login?next=/pro" replace />
  if (isLoading) return <Loader2 className="mx-auto my-20 animate-spin text-muted-foreground" />
  const pro = data?.profile ?? null

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{pro ? 'Your pro profile' : 'Offer your skills'}</h1>
        <p className="text-sm text-muted-foreground">{pro ? 'Customers find you in Hire a pro and send you jobs.' : 'Electricians, tailors, plumbers, tutors… Free. Our team checks every profile before it shows.'}</p>
      </div>
      {pro && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4 text-sm">
          <span>
            Status: <strong>{pro.status === 'APPROVED' ? 'Live' : pro.status === 'PENDING' ? 'Waiting for approval' : pro.status?.toLowerCase()}</strong>
            {pro.statusNote ? ` · ${pro.statusNote}` : ''}
          </span>
          <span className="flex gap-2">
            <Button asChild size="sm" variant="outline"><Link to={`/pros/${pro.card.id}`}>View</Link></Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(!editing)}>{editing ? 'Close' : 'Edit'}</Button>
          </span>
        </div>
      )}
      {(!pro || editing) && <ProfileForm existing={pro} />}
      {pro && <Photos pro={pro} />}
      {pro?.status === 'APPROVED' && <Inbox />}
    </div>
  )
}
