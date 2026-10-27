import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Bike, CheckCircle2, Clock, Home, Loader2, MapPin, Package, Phone, RotateCcw, ShoppingCart, Truck, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { api, ApiError, type FulfilmentStatus, type OrderStatus, type OrderStatusView } from '@/lib/api'
import { formatDate, formatETB, reasonMessage } from '@/lib/format'
import { t as tr, useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { CancelParcel } from './cancel-parcel'
import { OrderProblems } from './order-problems'
import { useCart } from '@/store/cart'

const POLL_MS = 3000

/** What the status badge says for each order status. */
const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'pending payment',
  PAYMENT_FAILED: 'payment failed',
  PAID: 'paid',
  PARTIALLY_REFUNDED: 'partially refunded',
  REFUNDED: 'refunded',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  REVIEW_REQUIRED: 'review required',
  CASH_ON_DELIVERY: 'cash on delivery',
}

/** The payment hasn't settled yet, so keep asking the backend (which asks BillPay when needed). */
function isSettling(o: OrderStatusView) {
  return o.status === 'PENDING_PAYMENT' && o.payment?.status === 'PENDING'
}

export function OrderStatusPanel({
  orderNumber,
  phone,
  cancelled = false,
}: {
  orderNumber: string
  phone: string
  cancelled?: boolean
}) {
  const t = useT()
  const query = useQuery({
    queryKey: ['order-status', orderNumber, phone],
    queryFn: () => api.orderStatus(orderNumber, phone),
    refetchInterval: (q) => (q.state.data && isSettling(q.state.data) && !cancelled ? POLL_MS : false),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 3,
  })

  const pay = useMutation({
    mutationFn: () => api.pay(orderNumber, phone),
    onSuccess: (res) => {
      if (res.checkoutUrl) window.location.assign(res.checkoutUrl)
      else query.refetch()
    },
    onError: (err) => {
      toast.error(err.message)
      query.refetch()
    },
  })

  const qc = useQueryClient()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const cancel = useMutation({
    mutationFn: () => api.cancelOrder(orderNumber, phone),
    onSuccess: (view) => {
      qc.setQueryData(['order-status', orderNumber, phone], view)
      setConfirmCancel(false)
      toast.success(tr('Order cancelled'))
    },
    onError: (err) => {
      toast.error(err.message)
      query.refetch()
    },
  })

  if (query.isLoading) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardContent className="flex items-center justify-center gap-3 py-16 text-muted-foreground">
          <Loader2 className="animate-spin" /> {t('Loading your order…')}
        </CardContent>
      </Card>
    )
  }
  if (query.error) {
    const notFound = query.error instanceof ApiError && query.error.status === 404
    return (
      <Card className="mx-auto max-w-xl">
        <CardContent className="space-y-4 py-12 text-center">
          <XCircle className="mx-auto size-10 text-destructive" />
          <p className="font-medium">{notFound ? t('No order matches that number and phone.') : t('We couldn’t load your order.')}</p>
          <Button asChild variant="outline">
            <Link to="/orders/track">{t('Try again')}</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const o = query.data!
  const view = describe(o, cancelled)
  const retryButton = o.canRetry && (
    <Button size="lg" className="h-11" disabled={pay.isPending} onClick={() => pay.mutate()}>
      {pay.isPending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
      {o.payment?.status === 'PENDING' ? t('Continue payment') : o.payment ? t('Try paying again') : t('Pay now')}
    </Button>
  )
  const canOrderAgain = (o.status === 'EXPIRED' || o.status === 'CANCELLED') && o.items.some((i) => i.productSlug)

  return (
    <Card className="mx-auto max-w-xl overflow-hidden pt-0">
      <div className={`flex flex-col items-center gap-3 px-6 py-10 text-center ${view.tone}`}>
        <view.icon className={`size-12 ${view.iconClass}`} />
        <h1 className="text-2xl font-semibold">{t(view.title)}</h1>
        <p className="max-w-sm text-muted-foreground">{view.text}</p>
        {isSettling(o) && !cancelled && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> {t('Checking with BillPay every few seconds')}
          </p>
        )}
        {o.canRetry && o.payBy && <PayCountdown payBy={o.payBy} onElapsed={() => query.refetch()} />}
      </div>
      <CardContent className="space-y-4 pt-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t('Order')}</span>
          <span className="font-mono font-medium">{o.orderNumber}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t('Status')}</span>
          <Badge variant="outline">{t(ORDER_STATUS_LABEL[o.status] ?? o.status.replaceAll('_', ' ').toLowerCase())}</Badge>
        </div>
        {o.payment?.paymentMethod && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('Paid with')}</span>
            <span>{o.payment.paymentMethod.replaceAll('_', ' ')}</span>
          </div>
        )}
        <Separator />
        {o.items.map((i) => (
          <div key={i.productName} className="flex justify-between text-sm">
            <span>
              {i.productName} <span className="text-muted-foreground">× {i.quantity}</span>
            </span>
            <span className="tabular-nums">{formatETB(i.lineTotal)}</span>
          </div>
        ))}
        <Separator />
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t('Subtotal')}</span>
          <span className="tabular-nums">{formatETB(o.subtotal)}</span>
        </div>
        {o.discountAmount > 0 && (
          <div className="flex justify-between text-sm text-success">
            <span>{t('Discount ({code})', { code: o.discountCode ?? '' })}</span>
            <span className="tabular-nums">−{formatETB(o.discountAmount)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t('Delivery')}</span>
          <span className="tabular-nums">{o.deliveryFee > 0 ? formatETB(o.deliveryFee) : t('Free')}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>{t('Total')}</span>
          <span className="tabular-nums">{formatETB(o.total)}</span>
        </div>
        {o.delivery?.address && <DeliveryBlock o={o} />}
        <div className="flex flex-col gap-2 pt-2 sm:flex-row-reverse">
          {retryButton}
          {canOrderAgain && <OrderAgainButton items={o.items} />}
          <Button asChild size="lg" variant="outline" className="h-11">
            <Link to="/shop">{t('Continue shopping')}</Link>
          </Button>
        </div>
        {o.canCancel && (
          <div className="text-center">
            {confirmCancel ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <span>{t('Cancel this order? Your items go back on sale.')}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
                    {cancel.isPending && <Loader2 className="animate-spin" />} {t('Yes, cancel order')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmCancel(false)}>{t('Keep it')}</Button>
                </div>
              </div>
            ) : (
              <button type="button" className="text-sm text-muted-foreground underline-offset-4 hover:text-destructive hover:underline" onClick={() => setConfirmCancel(true)}>
                {t('Cancel this order')}
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** "Items held for 12:34": counts down to the moment the unpaid order is released. */
function PayCountdown({ payBy, onElapsed }: { payBy: string; onElapsed: () => void }) {
  const t = useT()
  const deadline = new Date(payBy).getTime()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const left = Math.max(0, deadline - now)
  useEffect(() => {
    // the server expires the order within a minute of the deadline; look again shortly after
    if (left === 0) {
      const timer = window.setTimeout(onElapsed, 5000)
      return () => window.clearTimeout(timer)
    }
  }, [left === 0]) // eslint-disable-line react-hooks/exhaustive-deps
  const min = Math.floor(left / 60000)
  const sec = Math.floor((left % 60000) / 1000)
  const urgent = left < 5 * 60000
  return (
    <p
      className={cn(
        'flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium tabular-nums',
        urgent ? 'bg-destructive/10 text-destructive' : 'bg-background/70 text-foreground',
      )}
      role="timer"
      aria-live="off"
    >
      <Clock className="size-4" />
      {left > 0 ? t('Items held for you for {time}', { time: `${min}:${String(sec).padStart(2, '0')}` }) : t('Payment window closing…')}
    </p>
  )
}

/** Puts the items of an expired or cancelled order back in the cart, at today's price and stock. */
function OrderAgainButton({ items }: { items: OrderStatusView['items'] }) {
  const t = useT()
  const add = useCart((s) => s.add)
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    let added = 0
    const missing: string[] = []
    for (const item of items) {
      if (!item.productSlug) {
        missing.push(item.productName)
        continue
      }
      try {
        const product = await api.product(item.productSlug)
        const qty = Math.min(item.quantity, product.available)
        if (qty > 0) {
          add(product, qty)
          added++
        } else {
          missing.push(product.name)
        }
      } catch {
        missing.push(item.productName)
      }
    }
    setBusy(false)
    if (added === 0) toast.error(tr('These items aren’t available any more.'))
    else if (missing.length > 0) toast.warning(tr('Added to your cart. Not available now: {items}', { items: missing.join(', ') }))
    else toast.success(tr('Items added to your cart'))
  }
  return (
    <Button size="lg" className="h-11" disabled={busy} onClick={run}>
      {busy ? <Loader2 className="animate-spin" /> : <ShoppingCart />} {t('Order again')}
    </Button>
  )
}

const STEPS: { key: FulfilmentStatus; label: string; icon: typeof Package }[] = [
  { key: 'UNFULFILLED', label: 'Paid', icon: CheckCircle2 },
  { key: 'PROCESSING', label: 'Preparing', icon: Package },
  { key: 'SHIPPED', label: 'On the way', icon: Truck },
  { key: 'DELIVERED', label: 'Delivered', icon: Home },
]

/** "I received my items": marks the parcel delivered and lets Sodo Gebeya pay the seller. */
function ConfirmReceipt({ o, parcelNo, label }: { o: OrderStatusView; parcelNo: number; label: string }) {
  const t = useT()
  const qc = useQueryClient()
  const confirm = useMutation({
    mutationFn: () => api.confirmReceived(o.orderNumber, parcelNo),
    onSuccess: (next) => {
      qc.setQueriesData({ queryKey: ['order-status', o.orderNumber] }, next)
      qc.invalidateQueries({ queryKey: ['order-status', o.orderNumber] })
      toast.success(tr('Thanks! The seller gets paid now.'))
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <div className="space-y-1">
      <Button size="sm" className="w-full" disabled={confirm.isPending} onClick={() => confirm.mutate()}>
        {confirm.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} {label}
      </Button>
      <p className="text-[11px] text-muted-foreground">{t("Only tap this once you have the items. Problem? Don't confirm; contact us.")}</p>
    </div>
  )
}

/** The rider bringing a parcel (M21), with a call button. */
function RiderCard({ rider }: { rider: { name: string; phone: string } }) {
  const t = useT()
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-primary"><Bike className="size-4" /></span>
      <span className="min-w-0 flex-1 text-sm">
        <span className="block font-semibold">{t('{name} is bringing it', { name: rider.name })}</span>
        <span className="block text-xs text-muted-foreground">{rider.phone}</span>
      </span>
      <a href={`tel:${rider.phone}`} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground">
        <Phone className="size-4" /> {t('Call')}
      </a>
    </div>
  )
}

/** Orders from several sellers: one line per parcel, each with its own progress. */
function ParcelList({ o }: { o: OrderStatusView }) {
  const t = useT()
  return (
    <ul className="space-y-3">
      {o.parcels.map((p) => {
        const reached = p.fulfilmentStatus ? STEPS.findIndex((s) => s.key === p.fulfilmentStatus) : -1
        const items = o.items.filter((i) => i.parcelNo === p.parcelNo)
        return (
          <li key={p.number} className="space-y-2 rounded-lg bg-background p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-semibold">
                {t('From')} {p.sellerSlug ? <Link to={`/shops/${p.sellerSlug}`} className="hover:underline">{p.seller}</Link> : 'Sodo Gebeya'}
              </span>
              <span className={cn('text-xs font-semibold', p.fulfilmentStatus === 'CANCELLED' ? 'text-destructive' : reached >= 3 ? 'text-success' : 'text-muted-foreground')}>
                {p.fulfilmentStatus === 'CANCELLED' ? t('Cancelled') : reached >= 0 ? t(STEPS[reached].label) : ''}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {items.map((i) => `${i.quantity} × ${i.productName}`).join(', ')} · {p.deliveryFee === 0 ? t('free delivery') : t('delivery {fee}', { fee: formatETB(p.deliveryFee) })}
            </p>
            {p.fulfilmentStatus !== 'CANCELLED' && (
              <div className="flex gap-1" aria-hidden>
                {STEPS.map((s, i) => <span key={s.key} className={cn('h-1.5 flex-1 rounded-full', i <= reached ? 'bg-success' : 'bg-border')} />)}
              </div>
            )}
            {p.trackingNote && p.fulfilmentStatus === 'SHIPPED' && (
              <p className="text-xs"><Truck className="mr-1 inline size-3.5" />{p.trackingNote}</p>
            )}
            {p.rider && <RiderCard rider={p.rider} />}
            {p.canConfirmReceipt && <ConfirmReceipt o={o} parcelNo={p.parcelNo} label={t('I received the items from {seller}', { seller: p.seller ?? 'Sodo Gebeya' })} />}
            {p.fulfilmentStatus === 'UNFULFILLED' && (
              <CancelParcel orderNumber={o.orderNumber} parcelNo={p.parcelNo} amount={p.itemsTotal + p.deliveryFee} seller={p.seller ?? 'Sodo Gebeya'} cash={o.paymentMethod === 'CASH'} />
            )}
          </li>
        )
      })}
    </ul>
  )
}

function DeliveryBlock({ o }: { o: OrderStatusView }) {
  const t = useT()
  const status = o.delivery.fulfilmentStatus
  const reached = status ? STEPS.findIndex((s) => s.key === status) : -1
  const multi = (o.parcels?.length ?? 0) > 1
  return (
    <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
      <div className="flex items-start gap-3 text-sm">
        <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="font-medium">{t('Delivery to {address}', { address: `${o.delivery.address}, ${o.delivery.city}` })}</p>
          {o.delivery.notes && <p className="text-muted-foreground">{t('Note: {notes}', { notes: o.delivery.notes })}</p>}
        </div>
      </div>
      {multi && (
        <p className="text-xs text-muted-foreground">
          {t('Your order comes from {n} sellers. Each delivers their own items, so they may arrive separately.', { n: o.parcels.length })}
        </p>
      )}
      {multi && status ? (
        <ParcelList o={o} />
      ) : status === 'CANCELLED' ? (
        <p className="text-sm text-destructive">{t('Delivery was cancelled. Our team will contact you about a refund.')}</p>
      ) : status ? (
        <ol className="grid grid-cols-4 gap-1" aria-label={t('Delivery progress')}>
          {STEPS.map((s, i) => {
            const done = i <= reached
            const at = s.key === 'SHIPPED' ? o.delivery.shippedAt : s.key === 'DELIVERED' ? o.delivery.deliveredAt : s.key === 'UNFULFILLED' ? o.paidAt : stepTime(o, 'FULFILMENT_PROCESSING')
            return (
              <li key={s.key} className="flex flex-col items-center gap-1.5 text-center" aria-current={i === reached ? 'step' : undefined}>
                <div className="flex w-full items-center">
                  <span className={cn('h-0.5 flex-1', i === 0 ? 'invisible' : done ? 'bg-success' : 'bg-border')} />
                  <span className={cn('grid size-8 place-items-center rounded-full border', done ? 'border-success bg-success text-white' : 'bg-background text-muted-foreground')}>
                    <s.icon className="size-4" />
                  </span>
                  <span className={cn('h-0.5 flex-1', i === STEPS.length - 1 ? 'invisible' : i < reached ? 'bg-success' : 'bg-border')} />
                </div>
                <span className={cn('text-xs', done ? 'font-medium' : 'text-muted-foreground')}>{t(s.label)}</span>
                {done && at && <span className="text-[11px] text-muted-foreground">{formatDate(at)}</span>}
              </li>
            )
          })}
        </ol>
      ) : o.status === 'PENDING_PAYMENT' || o.status === 'PAYMENT_FAILED' ? (
        <p className="text-sm text-muted-foreground">{t('Delivery starts once your payment is confirmed.')}</p>
      ) : null}
      {!multi && o.delivery.trackingNote && status === 'SHIPPED' && (
        <p className="rounded-lg bg-background px-3 py-2 text-sm"><Truck className="mr-1.5 inline size-4" />{o.delivery.trackingNote}</p>
      )}
      {!multi && o.parcels?.[0]?.rider && <RiderCard rider={o.parcels[0].rider} />}
      {!multi && o.parcels?.[0]?.canConfirmReceipt && <ConfirmReceipt o={o} parcelNo={o.parcels[0].parcelNo} label={t('I received my items')} />}
      {!multi && o.parcels?.[0]?.fulfilmentStatus === 'UNFULFILLED' && (
        <CancelParcel orderNumber={o.orderNumber} parcelNo={o.parcels[0].parcelNo} amount={o.total} cash={o.paymentMethod === 'CASH'} />
      )}
      <OrderProblems o={o} />
    </div>
  )
}

function stepTime(o: OrderStatusView, type: string) {
  return o.timeline?.find((e) => e.type === type)?.at ?? null
}

function describe(o: OrderStatusView, cancelled: boolean) {
  const reason = tr(reasonMessage(o.payment?.reasonCode))
  const first = o.customerName.split(' ')[0]
  switch (o.status) {
    case 'PAID':
      switch (o.delivery?.fulfilmentStatus) {
        case 'SHIPPED':
          return { icon: Truck, iconClass: 'text-brand', tone: 'bg-accent', title: 'Your order is on the way', text: tr('The rider will call you before arriving.') }
        case 'DELIVERED':
          return { icon: Home, iconClass: 'text-success', tone: 'bg-success/10', title: 'Delivered', text: tr('Enjoy your order, {name}! Thank you for shopping on Sodo Gebeya.', { name: first }) }
        case 'CANCELLED':
          return { icon: XCircle, iconClass: 'text-destructive', tone: 'bg-destructive/10', title: 'Delivery cancelled', text: tr('We couldn’t deliver this order. Our team will contact you about a refund.') }
        case 'PROCESSING':
          return { icon: Package, iconClass: 'text-brand', tone: 'bg-accent', title: 'We’re preparing your order', text: tr('Your payment is confirmed and your items are being packed.') }
        default:
          return { icon: CheckCircle2, iconClass: 'text-success', tone: 'bg-success/10', title: 'Payment confirmed', text: tr('Thank you, {name}! BillPay confirmed your payment and your order is being prepared.', { name: first }) }
      }
    case 'CASH_ON_DELIVERY':
      return o.delivery?.fulfilmentStatus === 'SHIPPED'
        ? { icon: Truck, iconClass: 'text-brand', tone: 'bg-accent', title: 'On the way: have the cash ready', text: tr('Pay {amount} in cash to the seller or rider when it arrives.', { amount: formatETB(o.total) }) }
        : { icon: Package, iconClass: 'text-brand', tone: 'bg-accent', title: 'Order placed: pay cash on delivery', text: tr('Thank you, {name}! The seller is preparing your order. Pay {amount} in cash when it arrives or when you pick it up.', { name: first, amount: formatETB(o.total) }) }
    case 'PAYMENT_FAILED':
      return { icon: XCircle, iconClass: 'text-destructive', tone: 'bg-destructive/10', title: 'Payment didn’t go through', text: `${reason} ${tr('Your items are still reserved — you can try again.')}` }
    case 'EXPIRED':
      return { icon: Clock, iconClass: 'text-muted-foreground', tone: 'bg-muted', title: 'Payment window closed', text: tr('We didn’t receive a payment in time, so the order was released. Still want these items? Order them again in one tap.') }
    case 'REVIEW_REQUIRED':
      return { icon: AlertTriangle, iconClass: 'text-warning', tone: 'bg-warning/10', title: 'We’re checking your payment', text: tr('Something about this payment needs a manual check. Our team will contact you shortly.') }
    case 'REFUNDED':
    case 'PARTIALLY_REFUNDED':
      return { icon: RotateCcw, iconClass: 'text-brand', tone: 'bg-accent', title: 'Refund issued', text: tr('A refund has been sent back through BillPay to your payment method.') }
    case 'CANCELLED':
      return { icon: XCircle, iconClass: 'text-muted-foreground', tone: 'bg-muted', title: 'Order cancelled', text: tr('This order was cancelled and nothing was charged. Its items are back on sale.') }
    default:
      if (cancelled) {
        return { icon: XCircle, iconClass: 'text-muted-foreground', tone: 'bg-muted', title: 'Payment cancelled', text: [tr('You left BillPay before paying.'), o.payment?.reasonCode ? tr('Your last try: {reason}', { reason }) : '', tr('Your order is saved — continue whenever you’re ready.')].filter(Boolean).join(' ') }
      }
      if (o.payment?.status === 'PENDING' && o.payment.reasonCode) {
        // BillPay keeps the payment open after a failed try, so the shopper can try again on the same link
        return { icon: AlertTriangle, iconClass: 'text-warning', tone: 'bg-warning/10', title: 'Your last try didn’t go through', text: `${reason} ${tr('Continue the payment to try again with another number or method.')}` }
      }
      if (o.payment?.status === 'PENDING') {
        return { icon: Loader2, iconClass: 'animate-spin text-brand', tone: 'bg-accent', title: 'Confirming your payment…', text: tr('This usually takes a few seconds. You can keep this page open; it updates by itself.') }
      }
      return { icon: Clock, iconClass: 'text-brand', tone: 'bg-accent', title: 'Payment not started', text: tr('We couldn’t open BillPay for this order yet. Please try again.') }
  }
}
