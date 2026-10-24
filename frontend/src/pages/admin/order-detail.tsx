import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ExternalLink, Loader2, Mail, MapPin, RefreshCw, RotateCcw, Truck, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { adminApi, EMAIL_KIND_LABEL, isAdmin, type Attempt, type OrderDetail } from '@/lib/admin-api'
import { formatDate, formatETB } from '@/lib/format'
import { JsonBlock, PageHeader, StatusBadge } from './shared'

function RefundDialog({ order, attempt, onClose }: { order: OrderDetail; attempt: Attempt; onClose: () => void }) {
  const qc = useQueryClient()
  const [amount, setAmount] = useState(String(attempt.refundable ?? ''))
  const [reason, setReason] = useState('')
  const refund = useMutation({
    mutationFn: () =>
      adminApi.createRefund(order.order.orderNumber, {
        amount: Number(amount),
        reason: reason || undefined,
        paymentAttemptId: attempt.id,
      }),
    onSuccess: (r) => {
      toast[r.status === 'REFUSED' || r.status === 'ERROR' ? 'error' : 'success'](
        `Refund ${r.merchantReference}: ${r.status}${r.reasonCode ? ` (${r.reasonCode})` : ''}`,
      )
      qc.invalidateQueries({ queryKey: ['admin-order', order.order.orderNumber] })
      onClose()
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Refund {attempt.merchantReference}</DialogTitle>
          <DialogDescription>
            Up to {formatETB(attempt.refundable ?? 0)} can be refunded. In the sandbox, an amount ending in .13 is refused.
          </DialogDescription>
        </DialogHeader>
        <form
          id="refund-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            refund.mutate()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="amount">Amount (ETB)</Label>
            <Input id="amount" type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Customer returned item" />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="refund-form" disabled={refund.isPending}>
            {refund.isPending && <Loader2 className="animate-spin" />} Refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const STEP_LABEL: Record<string, string> = {
  PROCESSING: 'Start preparing',
  SHIPPED: 'Mark shipped',
  DELIVERED: 'Mark delivered',
  CANCELLED: 'Cancel delivery',
}

function DeliveryCard({ data }: { data: OrderDetail }) {
  const qc = useQueryClient()
  const d = data.delivery
  const orderNumber = data.order.orderNumber
  const [note, setNote] = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const [confirmCancel, setConfirmCancel] = useState(false)
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-order', orderNumber] })
    qc.invalidateQueries({ queryKey: ['admin-orders'] })
  }
  // the note travels with the click, so a note typed just before clicking is never lost
  const fulfil = useMutation({
    mutationFn: ({ to, note }: { to: string; note: string }) => adminApi.fulfil(orderNumber, to, note.trim() || undefined),
    onSuccess: (r, sent) => {
      toast.success(`Delivery: ${r.fulfilmentStatus.toLowerCase()}`)
      // clear only the note we just sent, not one typed for the next step meanwhile
      setNote((current) => (current === sent.note ? '' : current))
      refresh()
    },
    onError: (e) => toast.error(e.message),
  })
  const cancel = useMutation({
    mutationFn: (reason: string) => adminApi.cancelOrder(orderNumber, reason.trim() || undefined),
    onSuccess: () => {
      toast.success('Order cancelled, stock released')
      setConfirmCancel(false)
      refresh()
    },
    onError: (e) => toast.error(e.message),
  })
  const unpaid = data.order.status === 'PENDING_PAYMENT' || data.order.status === 'PAYMENT_FAILED'
  const steps = d.nextSteps.filter((s) => s !== 'CANCELLED')
  const canCancelDelivery = d.nextSteps.includes('CANCELLED')

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base"><Truck className="size-4" /> Delivery</CardTitle>
        {d.fulfilmentStatus && <StatusBadge status={d.fulfilmentStatus} />}
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="space-y-1">
          <p className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span>{d.address ?? '—'}{d.city ? `, ${d.city}` : ''}</span></p>
          {d.notes && <p className="pl-6 text-muted-foreground">“{d.notes}”</p>}
        </div>
        <div className="space-y-1 rounded-lg bg-muted/50 p-3">
          <div className="flex justify-between"><span className="text-muted-foreground">Items</span><span className="tabular-nums">{formatETB(d.subtotal)}</span></div>
          {d.discountAmount > 0 && <div className="flex justify-between text-success"><span>Discount ({d.discountCode})</span><span className="tabular-nums">−{formatETB(d.discountAmount)}</span></div>}
          <div className="flex justify-between"><span className="text-muted-foreground">Delivery fee</span><span className="tabular-nums">{d.deliveryFee > 0 ? formatETB(d.deliveryFee) : 'free'}</span></div>
        </div>
        {d.trackingNote && <p className="text-muted-foreground">Tracking: {d.trackingNote}</p>}
        {d.shippedAt && <p className="text-xs text-muted-foreground">Shipped {formatDate(d.shippedAt)}</p>}
        {d.deliveredAt && <p className="text-xs text-muted-foreground">Delivered {formatDate(d.deliveredAt)}</p>}

        {isAdmin() && steps.length > 0 && (
          <div className="space-y-2 border-t pt-4">
            <Label htmlFor="fulfil-note">{steps.includes('SHIPPED') ? 'Rider / tracking note' : 'Note'} <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="fulfil-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={steps.includes('SHIPPED') ? 'Rider Dawit, 0911 000 111' : ''} />
            <div className="flex flex-wrap gap-2">
              {steps.map((s) => (
                <Button key={s} size="sm" variant={s === steps[0] ? 'default' : 'outline'} disabled={fulfil.isPending} onClick={() => fulfil.mutate({ to: s, note })}>
                  {fulfil.isPending && fulfil.variables?.to === s && <Loader2 className="animate-spin" />} {STEP_LABEL[s] ?? s}
                </Button>
              ))}
              {canCancelDelivery && (
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={fulfil.isPending} onClick={() => fulfil.mutate({ to: 'CANCELLED', note })}>
                  {STEP_LABEL.CANCELLED}
                </Button>
              )}
            </div>
            {canCancelDelivery && <p className="text-xs text-muted-foreground">Cancelling a paid order doesn’t refund it; issue the refund from the Payments tab.</p>}
          </div>
        )}
        {!d.fulfilmentStatus && !unpaid && data.order.status !== 'CANCELLED' && (
          <p className="text-xs text-muted-foreground">Delivery starts once the order is paid.</p>
        )}

        {isAdmin() && unpaid && (
          <div className="space-y-2 border-t pt-4">
            {confirmCancel ? (
              <>
                <Label htmlFor="cancel-reason">Why cancel? <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input id="cancel-reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} maxLength={300} placeholder="Customer asked by phone" />
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" disabled={cancel.isPending} onClick={() => cancel.mutate(cancelReason)}>
                    {cancel.isPending && <Loader2 className="animate-spin" />} Cancel order
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmCancel(false)}>Keep</Button>
                </div>
              </>
            ) : (
              <Button size="sm" variant="outline" className="w-full" onClick={() => setConfirmCancel(true)}>
                <XCircle /> Cancel unpaid order
              </Button>
            )}
            <p className="text-xs text-muted-foreground">Releases the reserved stock. If the customer still pays on BillPay, the order goes to review for a refund.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function AttemptCard({ attempt, order, onRefund }: { attempt: Attempt; order: OrderDetail; onRefund: () => void }) {
  const qc = useQueryClient()
  const reconcile = useMutation({
    mutationFn: () => adminApi.reconcile(attempt.id),
    onSuccess: (r) => {
      toast.info(`Status check: ${r.outcome} → ${r.status}`)
      qc.invalidateQueries({ queryKey: ['admin-order', order.order.orderNumber] })
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center gap-3 space-y-0">
        <CardTitle className="font-mono text-sm">{attempt.merchantReference}</CardTitle>
        <StatusBadge status={attempt.status} />
        {attempt.reasonCode && <span className="font-mono text-xs text-destructive">{attempt.reasonCode}</span>}
        <div className="ml-auto flex gap-2">
          {isAdmin() && attempt.billpayPaymentId && (
            <Button size="sm" variant="outline" onClick={() => reconcile.mutate()} disabled={reconcile.isPending}>
              {reconcile.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Check with BillPay
            </Button>
          )}
          {isAdmin() && attempt.status === 'SUCCEEDED' && (attempt.refundable ?? 0) > 0 && (
            <Button size="sm" variant="outline" onClick={onRefund}>
              <RotateCcw /> Refund
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Field label="BillPay payment id" value={attempt.billpayPaymentId} mono />
          <Field label="Idempotency-Key" value={attempt.idempotencyKey} mono />
          <Field label="Amount" value={formatETB(attempt.amount)} />
          <Field label="Refundable" value={attempt.refundable !== null ? formatETB(attempt.refundable) : null} />
          <Field label="Method" value={attempt.paymentMethod} />
          <Field label="Expires" value={formatDate(attempt.expiresAt)} />
          <Field label="Last status check" value={formatDate(attempt.lastCheckedAt)} />
          <Field label="Created" value={formatDate(attempt.createdAt)} />
        </dl>
        {attempt.checkoutUrl && (
          <a href={attempt.checkoutUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-brand hover:underline">
            Open BillPay checkout <ExternalLink className="size-3" />
          </a>
        )}
        {attempt.error && <p className="rounded-lg bg-destructive/10 p-3 font-mono text-xs text-destructive">{attempt.error}</p>}
        <div className="grid gap-4 lg:grid-cols-2">
          <JsonBlock label="Request to BillPay" raw={attempt.requestPayload} />
          <JsonBlock label="Response from BillPay" raw={attempt.responsePayload} />
        </div>
      </CardContent>
    </Card>
  )
}

function Field({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-dashed py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? 'truncate font-mono text-xs' : ''}>{value || '—'}</dd>
    </div>
  )
}

export function AdminOrderDetailPage() {
  const { orderNumber = '' } = useParams()
  const [refunding, setRefunding] = useState<Attempt | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['admin-order', orderNumber],
    queryFn: () => adminApi.order(orderNumber),
    refetchInterval: 5_000,
  })
  const qc = useQueryClient()
  const retryRefund = useMutation({
    mutationFn: adminApi.retryRefund,
    onSuccess: (r) => {
      toast.info(`Refund ${r.merchantReference}: ${r.status}`)
      qc.invalidateQueries({ queryKey: ['admin-order', orderNumber] })
    },
    onError: (e) => toast.error(e.message),
  })

  if (isLoading || !data) return <Skeleton className="h-96 rounded-xl" />
  const o = data.order

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link to="/admin/orders">
          <ChevronLeft /> Orders
        </Link>
      </Button>
      <PageHeader
        title={o.orderNumber}
        description={`${o.customerName} · ${o.customerPhone} · ${data.customerEmail}`}
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status={o.status} />
            <span className="text-xl font-semibold tabular-nums">{formatETB(o.total)}</span>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Tabs defaultValue="payments" className="min-w-0">
          <TabsList>
            <TabsTrigger value="payments">Payments ({data.attempts.length})</TabsTrigger>
            <TabsTrigger value="webhooks">Webhooks ({data.webhooks.length})</TabsTrigger>
            <TabsTrigger value="refunds">Refunds ({data.refunds.length})</TabsTrigger>
            <TabsTrigger value="emails">Emails ({data.emails.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="payments" className="space-y-4">
            {data.attempts.length === 0 && <p className="text-sm text-muted-foreground">No payment attempts.</p>}
            {data.attempts.map((a) => (
              <AttemptCard key={a.id} attempt={a} order={data} onRefund={() => setRefunding(a)} />
            ))}
          </TabsContent>
          <TabsContent value="webhooks" className="space-y-4">
            {data.webhooks.length === 0 && <p className="text-sm text-muted-foreground">No webhooks received for this order yet.</p>}
            {data.webhooks.map((w) => (
              <Card key={w.id}>
                <CardHeader className="flex flex-row flex-wrap items-center gap-3 space-y-0">
                  <CardTitle className="text-sm">#{w.id} {w.eventType ?? 'event'}</CardTitle>
                  <StatusBadge status={w.status} />
                  <span className="text-xs text-muted-foreground">reported {w.reportedStatus ?? '—'}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{formatDate(w.receivedAt)}</span>
                </CardHeader>
                <CardContent className="space-y-3">
                  {w.error && <p className="text-xs text-muted-foreground">{w.error}</p>}
                  <JsonBlock label="Payload" raw={w.payload} />
                </CardContent>
              </Card>
            ))}
          </TabsContent>
          <TabsContent value="refunds" className="space-y-4">
            {data.refunds.length === 0 && <p className="text-sm text-muted-foreground">No refunds.</p>}
            {data.refunds.map((r) => (
              <Card key={r.id}>
                <CardHeader className="flex flex-row flex-wrap items-center gap-3 space-y-0">
                  <CardTitle className="font-mono text-sm">{r.merchantReference}</CardTitle>
                  <StatusBadge status={r.status} />
                  {r.reasonCode && <span className="font-mono text-xs text-destructive">{r.reasonCode}</span>}
                  {r.external && <span className="text-xs text-muted-foreground">issued outside TenaShop</span>}
                  <span className="ml-auto font-medium tabular-nums">{formatETB(r.amount)}</span>
                  {isAdmin() && (r.status === 'ERROR' || r.status === 'REQUESTED') && (
                    <Button size="sm" variant="outline" onClick={() => retryRefund.mutate(r.id)} disabled={retryRefund.isPending}>
                      Retry
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {r.reason && <p className="text-sm text-muted-foreground">{r.reason}</p>}
                  {r.error && <p className="rounded-lg bg-destructive/10 p-3 font-mono text-xs text-destructive">{r.error}</p>}
                  <div className="grid gap-4 lg:grid-cols-2">
                    <JsonBlock label="Request" raw={r.requestPayload} />
                    <JsonBlock label="Response" raw={r.responsePayload} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
          <TabsContent value="emails" className="space-y-2">
            {data.emails.length === 0 && <p className="text-sm text-muted-foreground">No emails sent for this order.</p>}
            {data.emails.map((n) => (
              <div key={n.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3">
                <Mail className="size-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{EMAIL_KIND_LABEL[n.kind] ?? n.kind}</p>
                  <p className="truncate text-xs text-muted-foreground">{n.subject} · {n.recipient}</p>
                  {n.error && <p className="text-xs text-destructive">{n.error}</p>}
                </div>
                <StatusBadge status={n.status} />
                <span className="text-xs text-muted-foreground">{formatDate(n.sentAt ?? n.createdAt)}</span>
              </div>
            ))}
          </TabsContent>
        </Tabs>

        <div className="space-y-6">
          <DeliveryCard data={data} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {data.items.map((i) => (
                <div key={i.productId} className="flex justify-between gap-2">
                  <span>
                    {i.productName} <span className="text-muted-foreground">× {i.quantity}</span>
                  </span>
                  <span className="tabular-nums">{formatETB(i.lineTotal)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-4 border-l pl-5">
                {data.timeline.map((e) => (
                  <li key={e.id} className="relative">
                    <span className="absolute -left-[25px] top-1 size-2.5 rounded-full border-2 border-background bg-brand" />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{e.type.replaceAll('_', ' ').toLowerCase()}</span>
                      {e.toStatus && e.toStatus !== e.fromStatus && <StatusBadge status={e.toStatus} />}
                    </div>
                    {e.detail && <p className="mt-0.5 break-words font-mono text-[11px] text-muted-foreground">{e.detail}</p>}
                    <p className="text-[11px] text-muted-foreground">{formatDate(e.createdAt)}</p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>

      {refunding && <RefundDialog order={data} attempt={refunding} onClose={() => setRefunding(null)} />}
    </>
  )
}
