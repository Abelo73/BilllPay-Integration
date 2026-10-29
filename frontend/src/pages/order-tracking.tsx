import 'leaflet/dist/leaflet.css'

import { useQuery } from '@tanstack/react-query'
import L from 'leaflet'
import {
  ArrowLeft, Bike, Check, CheckCircle2, CreditCard, Home, Info, Loader2, MapPin, Package, Phone, ReceiptText, ShoppingBag, Store, Truck, Wallet, XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { orderExtrasApi, type ParcelTracking, type TrackStep, type TrackStepKey } from '@/lib/order-extras-api'
import { cn } from '@/lib/utils'
import { useOrderPhone } from '@/lib/order-phone'

const STEP: Record<TrackStepKey, { label: string; icon: typeof Check; hint?: string }> = {
  ORDERED: { label: 'Order placed', icon: ShoppingBag },
  PAID: { label: 'Paid with BillPay', icon: CreditCard, hint: 'Your money is held safely until you get your items.' },
  PAY_AT_DOOR: { label: 'Pay cash at the door', icon: Wallet },
  PACKING: { label: 'Seller is packing', icon: Package },
  RIDER_ASSIGNED: { label: 'Rider assigned', icon: Bike },
  ON_THE_WAY: { label: 'On the way', icon: Truck, hint: 'The rider will call you before arriving.' },
  CASH_PAID: { label: 'Cash paid', icon: Wallet },
  DELIVERED: { label: 'Delivered', icon: Home },
  RECEIVED: { label: 'You confirmed you got it', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelled', icon: XCircle },
}

/** A typical ride across Sodo; used only to move the rider pin along the line. */
const RIDE_MINUTES = 40

/** Done = it happened, or a later step happened (some steps can be skipped). */
function stepStates(steps: TrackStep[]) {
  const lastDone = steps.reduce((acc, s, i) => (s.at ? i : acc), -1)
  return steps.map((s, i) => ({ ...s, done: i <= lastDone, current: i === lastDone + 1 && steps[lastDone]?.key !== 'CANCELLED' }))
}

/** How far along the line the rider is: 0 = at the seller, 1 = at your door. An estimate, not GPS. */
function riderProgress(p: ParcelTracking, now: number) {
  const at = (k: TrackStepKey) => p.steps.find((s) => s.key === k)?.at
  if (at('DELIVERED') || at('RECEIVED') || at('CASH_PAID')) return 1
  const shipped = at('ON_THE_WAY')
  if (!shipped) return 0
  const minutes = (now - new Date(shipped).getTime()) / 60000
  return Math.min(0.9, Math.max(0.12, minutes / RIDE_MINUTES))
}

/** /orders/tracking?order=TS-…: map of the delivery and every step with time and place. */
export function OrderTrackingPage() {
  const t = useT()
  const [params] = useSearchParams()
  const order = params.get('order') ?? ''
  const phone = useOrderPhone(order)
  const query = useQuery({
    queryKey: ['order-tracking', order, phone],
    queryFn: () => orderExtrasApi.tracking(order, phone ?? ''),
    enabled: !!order && phone !== null,
    // refresh while something is moving
    refetchInterval: (q) => (q.state.data?.parcels.some((p) => p.fulfilmentStatus === 'SHIPPED' || p.fulfilmentStatus === 'PROCESSING') ? 20000 : false),
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2,
  })

  if (!order || phone === null) return <Navigate to={`/orders/track${order ? `?order=${encodeURIComponent(order)}` : ''}`} replace />
  const back = `/orders/track?order=${encodeURIComponent(order)}`

  return (
    <div className="px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button asChild variant="ghost" size="sm"><Link to={back}><ArrowLeft /> {t('Back to order')}</Link></Button>
          <span className="font-mono text-sm text-muted-foreground">{order}</span>
        </div>
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">{t('Delivery tracking')}</h1>
          {query.data?.deliveryAddress && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-4 shrink-0" /> {query.data.deliveryAddress}{query.data.deliveryArea ? ` · ${query.data.deliveryArea}` : ''}
            </p>
          )}
        </div>
        {query.isPending ? (
          <div className="grid place-items-center py-24"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>
        ) : query.error ? (
          <p className="rounded-2xl border p-8 text-center">{t('We couldn’t find this order.')}</p>
        ) : query.data.parcels.length === 0 ? (
          <p className="rounded-2xl border p-8 text-center text-muted-foreground">{t('Delivery starts once your payment is confirmed.')}</p>
        ) : (
          <>
            {query.data.parcels.length > 1 && (
              <p className="text-sm text-muted-foreground">
                {t('Your order comes from {n} sellers. Each delivers their own items, so they may arrive separately.', { n: query.data.parcels.length })}
              </p>
            )}
            {query.data.parcels.map((p) => <ParcelCard key={p.parcelNo} p={p} orderNumber={order} multi={query.data.parcels.length > 1} />)}
          </>
        )}
      </div>
    </div>
  )
}

function ParcelCard({ p, orderNumber, multi }: { p: ParcelTracking; orderNumber: string; multi: boolean }) {
  const t = useT()
  const states = stepStates(p.steps)
  const current = states.find((s) => s.current)
  const cancelled = p.fulfilmentStatus === 'CANCELLED'
  return (
    <section className="overflow-hidden rounded-3xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium"><Store className="size-4 text-muted-foreground" /> {p.seller}</p>
          {multi && <p className="font-mono text-xs text-muted-foreground">{p.number}</p>}
        </div>
        <Badge variant={cancelled ? 'destructive' : 'outline'} className="gap-1.5">
          {!cancelled && current && <span className="live-dot" />}
          {cancelled ? t('Cancelled') : current ? t(STEP[current.key].label) : t('Delivered')}
        </Badge>
      </div>
      <div className="grid lg:grid-cols-[1.25fr_1fr]">
        <div className="relative min-w-0">
          <DeliveryMap p={p} />
          <p className="absolute bottom-2 left-2 z-[400] flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-full bg-background/90 px-2.5 py-1 text-[11px] text-muted-foreground shadow backdrop-blur">
            <Info className="size-3 shrink-0" /> {t('Rider position is estimated from the delivery steps, not live GPS.')}
          </p>
        </div>
        <div className="space-y-4 p-5">
          {p.riderName && (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-accent p-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-white"><Bike className="size-5" /></span>
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.riderName}</p>
                  <p className="text-xs text-muted-foreground">{p.riderPhone ? t('Your rider') : t('Will bring your parcel')}</p>
                </div>
              </div>
              {p.riderPhone && (
                <Button asChild size="sm"><a href={`tel:${p.riderPhone}`}><Phone /> {t('Call')}</a></Button>
              )}
            </div>
          )}
          <ol className="relative space-y-0" aria-label={t('Delivery progress')}>
            {states.map((s, i) => {
              const meta = STEP[s.key]
              const last = i === states.length - 1
              return (
                <li key={s.key} className="relative flex gap-3 pb-5 last:pb-0" aria-current={s.current ? 'step' : undefined}>
                  {!last && <span aria-hidden className={cn('absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-0.5', s.done && states[i + 1]?.done ? 'bg-success' : 'bg-border')} />}
                  <span
                    className={cn(
                      'relative z-10 grid size-8 shrink-0 place-items-center rounded-full border',
                      s.key === 'CANCELLED' ? 'border-destructive bg-destructive text-white'
                        : s.done ? 'border-success bg-success text-white'
                          : s.current ? 'border-brand bg-background text-brand ring-4 ring-brand/15' : 'bg-background text-muted-foreground',
                    )}
                  >
                    {s.done && s.key !== 'CANCELLED' ? <Check className="size-4" /> : <meta.icon className="size-4" />}
                  </span>
                  <div className="min-w-0 pt-1">
                    <p className={cn('text-sm', s.done || s.current ? 'font-medium' : 'text-muted-foreground')}>
                      {t(meta.label)}
                      {s.current && <span className="ml-2 text-xs font-normal text-brand">{t('now')}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.at ? formatDate(s.at) : s.done ? t('done') : t('waiting')}
                      {s.place && (s.done || s.current) ? ` · ${s.place}` : ''}
                    </p>
                    {s.detail && (s.done || s.current) && <p className="mt-0.5 text-xs">{s.key === 'RIDER_ASSIGNED' ? t('Rider: {name}', { name: s.detail }) : s.detail}</p>}
                    {s.current && meta.hint && <p className="mt-0.5 text-xs text-muted-foreground">{t(meta.hint)}</p>}
                  </div>
                </li>
              )
            })}
          </ol>
          {p.steps.some((s) => s.key === 'PAID' && s.at) && (
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link to={`/orders/receipt?order=${encodeURIComponent(orderNumber)}`}><ReceiptText /> {t('View receipt')}</Link>
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}

const pin = (html: string, size = 36) =>
  L.divIcon({ html, className: 'sodo-pin', iconSize: [size, size], iconAnchor: [size / 2, size / 2] })

function DeliveryMap({ p }: { p: ParcelTracking }) {
  const t = useT()
  const el = useRef<HTMLDivElement>(null)
  // the rider pin moves on every half minute while the parcel is on the way
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (p.fulfilmentStatus !== 'SHIPPED') return
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [p.fulfilmentStatus])
  const progress = riderProgress(p, now)
  const ends = useMemo(() => {
    const from: [number, number] = [p.from.lat, p.from.lng]
    let to: [number, number] = [p.to.lat, p.to.lng]
    // same area: keep the two pins apart so both stay visible
    if (Math.abs(from[0] - to[0]) < 0.0008 && Math.abs(from[1] - to[1]) < 0.0008) to = [to[0] - 0.004, to[1] + 0.004]
    return { from, to }
  }, [p.from.lat, p.from.lng, p.to.lat, p.to.lng])

  useEffect(() => {
    if (!el.current) return
    const map = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)
    const { from, to } = ends
    const riderAt: [number, number] = [from[0] + (to[0] - from[0]) * progress, from[1] + (to[1] - from[1]) * progress]
    L.polyline([from, to], { className: 'sodo-route', weight: 4, dashArray: '6 8' }).addTo(map)
    if (progress > 0) L.polyline([from, riderAt], { className: 'sodo-route-done', weight: 5 }).addTo(map)
    L.marker(from, { icon: pin('<span class="sodo-pin-dot sodo-pin-shop">🏪</span>'), title: p.from.label }).addTo(map)
      .bindTooltip(p.from.label, { direction: 'top', offset: [0, -16] })
    L.marker(to, { icon: pin('<span class="sodo-pin-dot sodo-pin-home">🏠</span>'), title: p.to.label }).addTo(map)
      .bindTooltip(p.to.exact ? p.to.label : `${p.to.label} (${t('approximate')})`, { direction: 'top', offset: [0, -16] })
    if (p.fulfilmentStatus !== 'CANCELLED' && progress > 0 && progress < 1) {
      L.marker(riderAt, { icon: pin('<span class="sodo-pin-dot sodo-pin-rider">🛵</span>', 44), zIndexOffset: 1000 }).addTo(map)
        .bindTooltip(p.riderName ?? t('Rider'), { direction: 'top', offset: [0, -20], permanent: true })
    }
    map.fitBounds(L.latLngBounds([from, to]), { padding: [48, 48], maxZoom: 16 })
    return () => { map.remove() }
  }, [ends, progress, p.from.label, p.to.label, p.to.exact, p.fulfilmentStatus, p.riderName, t])

  return <div ref={el} className="sodo-map h-72 w-full bg-muted sm:h-96 lg:h-full lg:min-h-[26rem]" role="img" aria-label={t('Map of the delivery route')} />
}
