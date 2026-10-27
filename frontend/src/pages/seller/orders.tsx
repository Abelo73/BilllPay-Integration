import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Loader2, MapPin, Package, Phone, Search, Truck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import type { FulfilmentStatus } from '@/lib/api'
import { formatDate, formatETB } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { sellerApi, type SellerOrderTab } from '@/lib/seller-api'
import { cn } from '@/lib/utils'
import { CashReceived } from '@/components/cash-received'
import { SellerCancel } from '@/components/seller-cancel'
import { Pager } from '../admin/shared'
import { FULFILMENT_LABEL, OrderLine } from './shared'

/** What the button says for each next step. */
const STEP_ACTION: Partial<Record<FulfilmentStatus, string>> = {
  PROCESSING: 'Packing it',
  SHIPPED: 'Sent: on the way',
  DELIVERED: 'Delivered',
}

const TABS: { value: SellerOrderTab; label: string }[] = [
  { value: 'send', label: 'To send' },
  { value: 'way', label: 'On the way' },
  { value: 'done', label: 'Done' },
  { value: 'all', label: 'All' },
]

export function SellerOrdersPage() {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as SellerOrderTab) ?? 'send'
  const q = params.get('q') ?? ''
  const page = Number(params.get('page') ?? 0)
  const [search, setSearch] = useState(q)
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    if (k !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }
  useEffect(() => {
    const timer = setTimeout(() => search !== q && set('q', search || null), 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const { data, isLoading } = useQuery({
    queryKey: ['seller-orders', tab, q, page],
    queryFn: () => sellerApi.orders({ tab, q, page }),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex gap-1.5 overflow-x-auto" role="tablist" aria-label={t('Orders')}>
          {TABS.map((tb) => (
            <button
              key={tb.value}
              type="button"
              role="tab"
              aria-selected={tab === tb.value}
              onClick={() => set('tab', tb.value === 'send' ? null : tb.value)}
              className={cn(
                'h-9 shrink-0 rounded-full border px-3.5 text-sm font-semibold',
                tab === tb.value ? 'border-primary bg-primary/10 text-primary' : 'bg-card text-muted-foreground',
              )}
            >
              {t(tb.label)}
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto sm:w-64">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder={t('Order number or buyer')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t('Only paid orders with your items show here, and only your items in them.')}</p>
      {isLoading ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : data?.content.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {tab === 'send' ? t('Nothing to send right now.') : t('No orders here yet.')}
        </p>
      ) : (
        <div className="divide-y overflow-hidden rounded-2xl border bg-card">
          {data?.content.map((o) => <OrderLine key={o.orderNumber} o={o} />)}
        </div>
      )}
      {data && <Pager page={page} totalPages={data.totalPages} total={data.totalElements} size={data.size} onPage={(p) => set('page', String(p))} />}
    </div>
  )
}

export function SellerOrderPage() {
  const t = useT()
  const { orderNumber = '' } = useParams()
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const { data, isLoading, error } = useQuery({ queryKey: ['seller-order', orderNumber], queryFn: () => sellerApi.order(orderNumber) })
  const advance = useMutation({
    mutationFn: (status: FulfilmentStatus) => sellerApi.advance(orderNumber, status, status === 'SHIPPED' ? note : undefined),
    onSuccess: (d) => {
      qc.setQueryData(['seller-order', orderNumber], d)
      qc.invalidateQueries({ queryKey: ['seller-orders'] })
      qc.invalidateQueries({ queryKey: ['seller-summary'] })
      toast.success(t('Order is now: {status}. The buyer was told.', { status: t(FULFILMENT_LABEL[d.order.fulfilmentStatus!]) }))
      if (d.order.fulfilmentStatus === 'SHIPPED') setNote('') // keep a note typed before "Packing it"
    },
    onError: (e) => toast.error(e.message),
  })

  const back = (
    <Button asChild variant="ghost" size="sm" className="-ml-2">
      <Link to="/seller/orders"><ChevronLeft /> {t('Orders')}</Link>
    </Button>
  )
  if (error) return <div className="space-y-3">{back}<p className="text-sm text-destructive">{error.message}</p></div>
  if (isLoading || !data) return <Skeleton className="h-96 rounded-2xl" />
  const o = data.order
  const shipping = o.nextSteps.includes('SHIPPED')
  const parcelText = t('You deliver only your parcel {parcel}; the others bring theirs.').split('{parcel}')

  return (
    <div className="space-y-4 pb-6">
      {back}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-mono text-lg font-bold">{o.orderNumber}</h2>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
          {o.fulfilmentStatus ? t(FULFILMENT_LABEL[o.fulfilmentStatus]) : o.status}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        {o.cash
          ? o.cashCollectedAt ? t('Cash received {date}', { date: formatDate(o.cashCollectedAt) }) : t('Cash on delivery: not paid yet')
          : t('Paid {date}', { date: formatDate(o.paidAt) })}
      </p>
      {o.cash && !o.cashCollectedAt && o.fulfilmentStatus !== 'CANCELLED' && (
        <CashReceived orderNumber={o.orderNumber} amount={o.collect ?? o.itemsTotal + o.deliveryFee} />
      )}

      <section className="space-y-2 rounded-2xl border bg-card p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold"><Package className="size-4" /> {t('Your items')}</h3>
        <ul className="divide-y text-sm">
          {data.items.map((i) => (
            <li key={i.productId} className="flex justify-between gap-3 py-2">
              <span>{i.quantity} × {i.productName}</span>
              <span className="tabular-nums">{formatETB(i.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <p className="flex justify-between border-t pt-2 text-sm font-bold">
          <span>{t('Your share')}</span> <span className="tabular-nums">{formatETB(o.itemsTotal)}</span>
        </p>
        <p className="flex justify-between text-xs text-muted-foreground">
          <span>{t('Delivery the buyer paid for this parcel')}</span>
          <span className="tabular-nums">{o.deliveryFee === 0 ? t('Free') : formatETB(o.deliveryFee)}</span>
        </p>
      </section>

      {o.otherSellers && (
        <p className="rounded-2xl bg-muted p-4 text-sm">
          {t('The buyer also bought from other sellers in this order.')}{' '}
          {parcelText[0]}<span className="font-mono font-semibold">{o.parcelNumber}</span>{parcelText[1]}
        </p>
      )}
      <section className="space-y-2 rounded-2xl border bg-card p-4 text-sm">
        <h3 className="flex items-center gap-2 font-bold"><Truck className="size-4" /> {t('Deliver to')}</h3>
        <p className="font-semibold">{o.customerName}</p>
        {data.customerPhone && (
          <a href={`tel:${data.customerPhone}`} className="flex items-center gap-2 font-semibold text-primary">
            <Phone className="size-4" /> {data.customerPhone}
          </a>
        )}
        <p className="flex gap-2"><MapPin className="mt-0.5 size-4 shrink-0" /> {data.deliveryAddress}{o.deliveryCity && `, ${o.deliveryCity}`}</p>
        {data.deliveryNotes && <p className="text-muted-foreground">{t('Note: {note}', { note: data.deliveryNotes })}</p>}
        {data.trackingNote && <p className="text-muted-foreground">{t('Sent with: {note}', { note: data.trackingNote })}</p>}
      </section>

      {o.nextSteps.length > 0 && (
        <section className="space-y-3 rounded-2xl border bg-card p-4">
          {shipping && (
            <div className="space-y-2">
              <Label htmlFor="ship-note">{t('Who is bringing it?')} <span className="font-normal text-muted-foreground">{t('(optional, the buyer sees this)')}</span></Label>
              <Input id="ship-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={t('e.g. Bajaj rider Dawit, 0916 000 111')} />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {o.nextSteps.map((s, i) => (
              <Button
                key={s}
                size="lg"
                variant={i === 0 ? 'default' : 'outline'}
                className="h-12 flex-1"
                disabled={advance.isPending}
                onClick={() => advance.mutate(s)}
              >
                {advance.isPending && advance.variables === s && <Loader2 className="animate-spin" />}
                {STEP_ACTION[s] ? t(STEP_ACTION[s]) : s}
              </Button>
            ))}
          </div>
          {(o.fulfilmentStatus === 'UNFULFILLED' || o.fulfilmentStatus === 'PROCESSING') && (
            <SellerCancel orderNumber={o.orderNumber} amount={o.itemsTotal + o.deliveryFee} cash={o.cash && !o.cashCollectedAt} />
          )}
        </section>
      )}
    </div>
  )
}
