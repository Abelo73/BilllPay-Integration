import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ImagePlus, Loader2, Plus, Trash2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { isAdmin } from '@/lib/admin-api'
import { formatDate, formatETB } from '@/lib/format'
import { promoAdminApi, type AdminBoost, type AdminPlan, type Banner } from '@/lib/promo-api'
import { PageHeader, Pager, StatusBadge } from './shared'

const err = (e: Error) => toast.error(e.message)

/** Admin → Boosts & plans: confirm sellers' payments (M16 boosts, M17 Pro plan). */
export function AdminPromoPage() {
  const [kind, setKind] = useState<'boosts' | 'plans'>('boosts')
  const [show, setShow] = useState<'waiting' | 'active' | 'done'>('waiting')
  const [page, setPage] = useState(0)
  const boosts = useQuery({ queryKey: ['admin-boosts', show, page], queryFn: () => promoAdminApi.boosts(show, page), enabled: kind === 'boosts', placeholderData: keepPreviousData })
  const plans = useQuery({ queryKey: ['admin-plans', show, page], queryFn: () => promoAdminApi.plans(show === 'active' ? 'done' : show, page), enabled: kind === 'plans', placeholderData: keepPreviousData })
  const data = kind === 'boosts' ? boosts.data : plans.data
  return (
    <div className="space-y-4">
      <PageHeader title="Boosts & plans" description="Sellers pay by telebirr or bank and type the transaction number. Check it arrived, then confirm: boosts start at once, Pro plans are extended." />
      <div className="flex flex-wrap gap-3">
        <Tabs value={kind} onValueChange={(v) => { setKind(v as typeof kind); setPage(0); if (v === 'plans' && show === 'active') setShow('waiting') }}>
          <TabsList><TabsTrigger value="boosts">Boosts</TabsTrigger><TabsTrigger value="plans">Pro plans</TabsTrigger></TabsList>
        </Tabs>
        <Tabs value={show} onValueChange={(v) => { setShow(v as typeof show); setPage(0) }}>
          <TabsList>
            <TabsTrigger value="waiting">Waiting for payment</TabsTrigger>
            {kind === 'boosts' && <TabsTrigger value="active">Running</TabsTrigger>}
            <TabsTrigger value="done">Done</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {data?.content.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Nothing here.</p>}
      <div className="space-y-2">
        {kind === 'boosts'
          ? boosts.data?.content.map((b) => <BoostRow key={b.id} b={b} />)
          : plans.data?.content.map((p) => <PlanRow key={p.id} p={p} />)}
      </div>
      {data && data.totalPages > 1 && <Pager page={page} totalPages={data.totalPages} onPage={setPage} />}
    </div>
  )
}

function Decide({ waiting, onConfirm, onReject, pending }: { waiting: boolean; onConfirm: () => void; onReject: (note: string) => void; pending: boolean }) {
  if (!waiting || !isAdmin()) return null
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={pending} onClick={onConfirm}><Check /> Money received</Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => { const n = window.prompt('Why not? (the seller gets this by SMS)'); if (n) onReject(n) }}><X /> Reject</Button>
    </div>
  )
}

function BoostRow({ b }: { b: AdminBoost }) {
  const qc = useQueryClient()
  const done = () => { qc.invalidateQueries({ queryKey: ['admin-boosts'] }); qc.invalidateQueries({ queryKey: ['admin-promo-counts'] }); toast.success('Saved') }
  const confirm = useMutation({ mutationFn: () => promoAdminApi.confirmBoost(b.id), onSuccess: done, onError: err })
  const reject = useMutation({ mutationFn: (n: string) => promoAdminApi.rejectBoost(b.id, n), onSuccess: done, onError: err })
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-3 p-4 text-sm">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {b.productSlug ? <Link className="hover:underline" to={`/product/${b.productSlug}`} target="_blank">{b.productName}</Link> : b.productName} · {b.days} days · {formatETB(b.price)}
          </p>
          <p className="text-xs text-muted-foreground">
            {b.shopName} · {b.shopPhone ?? '—'} · asked {formatDate(b.createdAt)}
            {b.paymentReference ? <> · ref <span className="font-mono">{b.paymentReference}</span></> : ' · no reference yet'}
            {b.endsAt && ` · until ${formatDate(b.endsAt)}`}
            {b.note && ` · ${b.note}`}
          </p>
        </div>
        <StatusBadge status={b.status} />
        <Decide waiting={b.status === 'REQUESTED'} pending={confirm.isPending || reject.isPending} onConfirm={() => confirm.mutate()} onReject={(n) => reject.mutate(n)} />
      </CardContent>
    </Card>
  )
}

function PlanRow({ p }: { p: AdminPlan }) {
  const qc = useQueryClient()
  const done = () => { qc.invalidateQueries({ queryKey: ['admin-plans'] }); qc.invalidateQueries({ queryKey: ['admin-promo-counts'] }); toast.success('Saved') }
  const confirm = useMutation({ mutationFn: () => promoAdminApi.confirmPlan(p.id), onSuccess: done, onError: err })
  const reject = useMutation({ mutationFn: (n: string) => promoAdminApi.rejectPlan(p.id, n), onSuccess: done, onError: err })
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-3 p-4 text-sm">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{p.shopName} · Pro {p.months} month{p.months === 1 ? '' : 's'} · {formatETB(p.price)}</p>
          <p className="text-xs text-muted-foreground">
            {p.shopPhone ?? '—'} · asked {formatDate(p.createdAt)}
            {p.paymentReference ? <> · ref <span className="font-mono">{p.paymentReference}</span></> : ' · no reference yet'}
            {p.pro && p.planUntil && ` · Pro until ${formatDate(p.planUntil)}`}
            {p.note && ` · ${p.note}`}
          </p>
        </div>
        <StatusBadge status={p.status} />
        <Decide waiting={p.status === 'REQUESTED'} pending={confirm.isPending || reject.isPending} onConfirm={() => confirm.mutate()} onReject={(n) => reject.mutate(n)} />
      </CardContent>
    </Card>
  )
}

/** Admin → Banners: the home page strip (a shop's sale, an event, our news). */
export function AdminBannersPage() {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['admin-banners'], queryFn: promoAdminApi.banners })
  const [title, setTitle] = useState('')
  const create = useMutation({
    mutationFn: () => promoAdminApi.createBanner({ title, active: false }),
    onSuccess: () => { setTitle(''); qc.invalidateQueries({ queryKey: ['admin-banners'] }); toast.success('Added (off). Add a picture and a link, then switch it on.') },
    onError: err,
  })
  return (
    <div className="space-y-4">
      <PageHeader title="Banners" description="Shown on the home page while on and within their dates. Use a wide picture (about 1200 × 400)." />
      {isAdmin() && (
        <form className="flex max-w-xl gap-2" onSubmit={(e) => { e.preventDefault(); if (title.trim()) create.mutate() }}>
          <Input placeholder="Banner title, e.g. Holiday sale at Marta Boutique" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          <Button type="submit" disabled={!title.trim() || create.isPending}><Plus /> Add</Button>
        </form>
      )}
      <div className="space-y-3">
        {list.data?.map((b) => <BannerEditor key={`${b.id}-${b.imageUrl}`} b={b} />)}
        {list.data?.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No banners yet.</p>}
      </div>
    </div>
  )
}

const toLocal = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : '')
const fromLocal = (d: string) => (d ? new Date(d + 'T00:00:00').toISOString() : null)

function BannerEditor({ b }: { b: Banner }) {
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [f, setF] = useState({ title: b.title, subtitle: b.subtitle ?? '', linkUrl: b.linkUrl ?? '', startsAt: toLocal(b.startsAt), endsAt: toLocal(b.endsAt), position: String(b.position) })
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-banners'] })
  const save = useMutation({
    mutationFn: (active?: boolean) => promoAdminApi.updateBanner(b.id, {
      title: f.title, subtitle: f.subtitle, linkUrl: f.linkUrl, startsAt: fromLocal(f.startsAt), endsAt: fromLocal(f.endsAt),
      position: Number(f.position || 0), active: active ?? b.active,
    }),
    onSuccess: () => { refresh(); toast.success('Saved') },
    onError: err,
  })
  const image = useMutation({ mutationFn: (file: File) => promoAdminApi.bannerImage(b.id, file), onSuccess: refresh, onError: err })
  const remove = useMutation({ mutationFn: () => promoAdminApi.deleteBanner(b.id), onSuccess: refresh, onError: err })
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        <CardTitle className="min-w-0 flex-1 text-base">{b.title}</CardTitle>
        <span className="text-xs text-muted-foreground">{b.clicks} clicks · {b.showing ? 'showing now' : 'not showing'}</span>
        <Switch checked={b.active} disabled={!isAdmin() || save.isPending} onCheckedChange={(v) => save.mutate(v)} aria-label="Banner on" />
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-[280px_1fr]">
        <button type="button" onClick={() => input.current?.click()} disabled={!isAdmin()}
          className="grid aspect-[3/1] place-items-center overflow-hidden rounded-xl border-2 border-dashed bg-muted text-muted-foreground">
          {image.isPending ? <Loader2 className="animate-spin" /> : b.imageUrl ? <img src={b.imageUrl} alt="" className="size-full object-cover" /> : <ImagePlus />}
        </button>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const x = e.target.files?.[0]; if (x) image.mutate(x); e.target.value = '' }} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor={`t${b.id}`}>Title</Label><Input id={`t${b.id}`} value={f.title} maxLength={120} onChange={(e) => set('title', e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor={`s${b.id}`}>Small text</Label><Input id={`s${b.id}`} value={f.subtitle} maxLength={200} onChange={(e) => set('subtitle', e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor={`l${b.id}`}>Link</Label><Input id={`l${b.id}`} value={f.linkUrl} placeholder="/shops/marta-boutique or https://…" onChange={(e) => set('linkUrl', e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor={`p${b.id}`}>Order</Label><Input id={`p${b.id}`} type="number" value={f.position} onChange={(e) => set('position', e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor={`a${b.id}`}>From</Label><Input id={`a${b.id}`} type="date" value={f.startsAt} onChange={(e) => set('startsAt', e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor={`e${b.id}`}>Until</Label><Input id={`e${b.id}`} type="date" value={f.endsAt} onChange={(e) => set('endsAt', e.target.value)} /></div>
          {isAdmin() && (
            <div className="flex gap-2 sm:col-span-2">
              <Button size="sm" disabled={save.isPending} onClick={() => save.mutate(undefined)}>Save</Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (window.confirm('Delete this banner?')) remove.mutate() }}><Trash2 /> Delete</Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
