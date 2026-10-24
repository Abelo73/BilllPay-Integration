import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Clock, Home, Loader2, MapPin, Package, RotateCcw, Truck, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { api, ApiError, type FulfilmentStatus, type OrderStatusView } from '@/lib/api'
import { formatDate, formatETB, reasonMessage } from '@/lib/format'
import { cn } from '@/lib/utils'

const POLL_MS = 3000

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
  const query = useQuery({
    queryKey: ['order-status', orderNumber, phone],
    queryFn: () => api.orderStatus(orderNumber, phone),
    refetchInterval: (q) => (q.state.data && isSettling(q.state.data) && !cancelled ? POLL_MS : false),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 3,
  })

  const pay = useMutation({
    mutationFn: () => api.pay(orderNumber, phone),
    onSuccess: (res) => window.location.assign(res.checkoutUrl),
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
      toast.success('Order cancelled')
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
          <Loader2 className="animate-spin" /> Loading your order…
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
          <p className="font-medium">{notFound ? 'No order matches that number and phone.' : 'We couldn’t load your order.'}</p>
          <Button asChild variant="outline">
            <Link to="/orders/track">Try again</Link>
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
      {o.payment?.status === 'PENDING' ? 'Continue payment' : 'Try paying again'}
    </Button>
  )

  return (
    <Card className="mx-auto max-w-xl overflow-hidden pt-0">
      <div className={`flex flex-col items-center gap-3 px-6 py-10 text-center ${view.tone}`}>
        <view.icon className={`size-12 ${view.iconClass}`} />
        <h1 className="text-2xl font-semibold">{view.title}</h1>
        <p className="max-w-sm text-muted-foreground">{view.text}</p>
        {isSettling(o) && !cancelled && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> Checking with BillPay every few seconds
          </p>
        )}
      </div>
      <CardContent className="space-y-4 pt-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Order</span>
          <span className="font-mono font-medium">{o.orderNumber}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Status</span>
          <Badge variant="outline">{o.status.replaceAll('_', ' ').toLowerCase()}</Badge>
        </div>
        {o.payment?.paymentMethod && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Paid with</span>
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
          <span className="text-muted-foreground">Subtotal</span>
          <span className="tabular-nums">{formatETB(o.subtotal)}</span>
        </div>
        {o.discountAmount > 0 && (
          <div className="flex justify-between text-sm text-success">
            <span>Discount ({o.discountCode})</span>
            <span className="tabular-nums">−{formatETB(o.discountAmount)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Delivery</span>
          <span className="tabular-nums">{o.deliveryFee > 0 ? formatETB(o.deliveryFee) : 'Free'}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatETB(o.total)}</span>
        </div>
        {o.delivery?.address && <DeliveryBlock o={o} />}
        <div className="flex flex-col gap-2 pt-2 sm:flex-row-reverse">
          {retryButton}
          <Button asChild size="lg" variant="outline" className="h-11">
            <Link to="/shop">Continue shopping</Link>
          </Button>
        </div>
        {o.canCancel && (
          <div className="text-center">
            {confirmCancel ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <span>Cancel this order? Your items go back on sale.</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
                    {cancel.isPending && <Loader2 className="animate-spin" />} Yes, cancel order
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmCancel(false)}>Keep it</Button>
                </div>
              </div>
            ) : (
              <button type="button" className="text-sm text-muted-foreground underline-offset-4 hover:text-destructive hover:underline" onClick={() => setConfirmCancel(true)}>
                Cancel this order
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const STEPS: { key: FulfilmentStatus; label: string; icon: typeof Package }[] = [
  { key: 'UNFULFILLED', label: 'Paid', icon: CheckCircle2 },
  { key: 'PROCESSING', label: 'Preparing', icon: Package },
  { key: 'SHIPPED', label: 'On the way', icon: Truck },
  { key: 'DELIVERED', label: 'Delivered', icon: Home },
]

function DeliveryBlock({ o }: { o: OrderStatusView }) {
  const status = o.delivery.fulfilmentStatus
  const reached = status ? STEPS.findIndex((s) => s.key === status) : -1
  return (
    <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
      <div className="flex items-start gap-3 text-sm">
        <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="font-medium">Delivery to {o.delivery.address}, {o.delivery.city}</p>
          {o.delivery.notes && <p className="text-muted-foreground">Note: {o.delivery.notes}</p>}
        </div>
      </div>
      {status === 'CANCELLED' ? (
        <p className="text-sm text-destructive">Delivery was cancelled. Our team will contact you about a refund.</p>
      ) : status ? (
        <ol className="grid grid-cols-4 gap-1" aria-label="Delivery progress">
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
                <span className={cn('text-xs', done ? 'font-medium' : 'text-muted-foreground')}>{s.label}</span>
                {done && at && <span className="text-[11px] text-muted-foreground">{formatDate(at)}</span>}
              </li>
            )
          })}
        </ol>
      ) : o.status === 'PENDING_PAYMENT' || o.status === 'PAYMENT_FAILED' ? (
        <p className="text-sm text-muted-foreground">Delivery starts once your payment is confirmed.</p>
      ) : null}
      {o.delivery.trackingNote && status === 'SHIPPED' && (
        <p className="rounded-lg bg-background px-3 py-2 text-sm"><Truck className="mr-1.5 inline size-4" />{o.delivery.trackingNote}</p>
      )}
    </div>
  )
}

function stepTime(o: OrderStatusView, type: string) {
  return o.timeline?.find((t) => t.type === type)?.at ?? null
}

function describe(o: OrderStatusView, cancelled: boolean) {
  const reason = reasonMessage(o.payment?.reasonCode)
  switch (o.status) {
    case 'PAID':
      switch (o.delivery?.fulfilmentStatus) {
        case 'SHIPPED':
          return { icon: Truck, iconClass: 'text-brand', tone: 'bg-accent', title: 'Your order is on the way', text: 'The rider will call you before arriving.' }
        case 'DELIVERED':
          return { icon: Home, iconClass: 'text-success', tone: 'bg-success/10', title: 'Delivered', text: `Enjoy your order, ${o.customerName.split(' ')[0]}! Thank you for shopping with TenaShop.` }
        case 'CANCELLED':
          return { icon: XCircle, iconClass: 'text-destructive', tone: 'bg-destructive/10', title: 'Delivery cancelled', text: 'We couldn’t deliver this order. Our team will contact you about a refund.' }
        case 'PROCESSING':
          return { icon: Package, iconClass: 'text-brand', tone: 'bg-accent', title: 'We’re preparing your order', text: 'Your payment is confirmed and your items are being packed.' }
        default:
          return { icon: CheckCircle2, iconClass: 'text-success', tone: 'bg-success/10', title: 'Payment confirmed', text: `Thank you, ${o.customerName.split(' ')[0]}! BillPay confirmed your payment and your order is being prepared.` }
      }
    case 'PAYMENT_FAILED':
      return { icon: XCircle, iconClass: 'text-destructive', tone: 'bg-destructive/10', title: 'Payment didn’t go through', text: `${reason} Your items are still reserved — you can try again.` }
    case 'EXPIRED':
      return { icon: Clock, iconClass: 'text-muted-foreground', tone: 'bg-muted', title: 'Payment window closed', text: 'We didn’t receive a payment in time, so the order was released. You can place a new order any time.' }
    case 'REVIEW_REQUIRED':
      return { icon: AlertTriangle, iconClass: 'text-warning', tone: 'bg-warning/10', title: 'We’re checking your payment', text: 'Something about this payment needs a manual check. Our team will contact you shortly.' }
    case 'REFUNDED':
    case 'PARTIALLY_REFUNDED':
      return { icon: RotateCcw, iconClass: 'text-brand', tone: 'bg-accent', title: 'Refund issued', text: 'A refund has been sent back through BillPay to your payment method.' }
    case 'CANCELLED':
      return { icon: XCircle, iconClass: 'text-muted-foreground', tone: 'bg-muted', title: 'Order cancelled', text: 'This order was cancelled and nothing was charged. Its items are back on sale.' }
    default:
      if (cancelled) {
        return { icon: XCircle, iconClass: 'text-muted-foreground', tone: 'bg-muted', title: 'Payment cancelled', text: `You left BillPay before paying.${o.payment?.reasonCode ? ` Your last try: ${reason}` : ''} Your order is saved — continue whenever you’re ready.` }
      }
      if (o.payment?.status === 'PENDING' && o.payment.reasonCode) {
        // BillPay keeps the payment open after a failed try, so the shopper can try again on the same link
        return { icon: AlertTriangle, iconClass: 'text-warning', tone: 'bg-warning/10', title: 'Your last try didn’t go through', text: `${reason} Continue the payment to try again with another number or method.` }
      }
      if (o.payment?.status === 'PENDING') {
        return { icon: Loader2, iconClass: 'animate-spin text-brand', tone: 'bg-accent', title: 'Confirming your payment…', text: 'This usually takes a few seconds. You can keep this page open; it updates by itself.' }
      }
      return { icon: Clock, iconClass: 'text-brand', tone: 'bg-accent', title: 'Payment not started', text: 'We couldn’t open BillPay for this order yet. Please try again.' }
  }
}
