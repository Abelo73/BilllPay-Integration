import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Clock, Loader2, RotateCcw, XCircle } from 'lucide-react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { api, ApiError, type OrderStatusView } from '@/lib/api'
import { formatETB, reasonMessage } from '@/lib/format'

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
        <div className="flex justify-between font-semibold">
          <span>Total</span>
          <span>{formatETB(o.total)}</span>
        </div>
        <div className="flex flex-col gap-2 pt-2 sm:flex-row-reverse">
          {retryButton}
          <Button asChild size="lg" variant="outline" className="h-11">
            <Link to="/shop">Continue shopping</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function describe(o: OrderStatusView, cancelled: boolean) {
  const reason = reasonMessage(o.payment?.reasonCode)
  switch (o.status) {
    case 'PAID':
      return { icon: CheckCircle2, iconClass: 'text-success', tone: 'bg-success/10', title: 'Payment confirmed', text: `Thank you, ${o.customerName.split(' ')[0]}! BillPay confirmed your payment and your order is being prepared.` }
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
      return { icon: XCircle, iconClass: 'text-muted-foreground', tone: 'bg-muted', title: 'Order cancelled', text: 'This order was cancelled.' }
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
