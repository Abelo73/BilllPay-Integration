import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ExternalLink, Loader2, RefreshCw, RotateCcw } from 'lucide-react'
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
import { adminApi, isAdmin, type Attempt, type OrderDetail } from '@/lib/admin-api'
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
        </Tabs>

        <div className="space-y-6">
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
