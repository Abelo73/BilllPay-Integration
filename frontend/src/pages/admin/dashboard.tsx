import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeftRight, Banknote, Clock, Percent, Webhook } from 'lucide-react'
import { Link } from 'react-router'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { adminApi } from '@/lib/admin-api'
import { formatETB } from '@/lib/format'
import { PageHeader, StatusBadge } from './shared'

function Stat({ label, value, icon: Icon, hint }: { label: string; value: React.ReactNode; icon: typeof Banknote; hint?: string }) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 pt-6">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className="grid size-9 place-items-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="size-4" />
        </div>
      </CardContent>
    </Card>
  )
}

export function AdminDashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-dashboard'], queryFn: adminApi.dashboard, refetchInterval: 10_000 })

  if (isLoading || !data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
    )
  }

  const statuses = Object.entries(data.ordersByStatus).filter(([, n]) => n > 0)
  const failures = Object.entries(data.failuresByReason).sort((a, b) => b[1] - a[1])
  const maxFailure = Math.max(1, ...failures.map(([, n]) => n))
  const review = data.ordersByStatus.REVIEW_REQUIRED ?? 0

  return (
    <>
      <PageHeader title="Dashboard" description="Live view of payments flowing through BillPay. Refreshes every 10 seconds." />

      {review > 0 && (
        <Link
          to="/admin/orders?status=REVIEW_REQUIRED"
          className="flex items-center gap-3 rounded-xl border border-warning/50 bg-warning/10 p-4 text-sm hover:bg-warning/15"
        >
          <AlertTriangle className="size-4 shrink-0" />
          {review} order{review > 1 ? 's need' : ' needs'} review (amount mismatch, late or duplicate payment).
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Paid volume" value={formatETB(data.paidVolume)} icon={Banknote} />
        <Stat
          label="Payment success rate"
          value={data.paymentSuccessRate === null ? '—' : `${Math.round(data.paymentSuccessRate * 100)}%`}
          icon={Percent}
          hint="Succeeded ÷ finished attempts"
        />
        <Stat label="Pending payments" value={data.pendingPayments} icon={Clock} hint="Waiting for BillPay" />
        <Stat label="Webhooks queued" value={data.webhooksAwaitingProcessing} icon={Webhook} hint="Stored, not yet published to Kafka" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowLeftRight className="size-4" /> Orders by status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {statuses.length === 0 && <p className="text-sm text-muted-foreground">No orders yet. Place one from the store.</p>}
            {statuses.map(([status, n]) => (
              <Link
                key={status}
                to={`/admin/orders?status=${status}`}
                className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-muted"
              >
                <StatusBadge status={status} />
                <span className="font-medium tabular-nums">{n}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Failed payments by reason</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {failures.length === 0 && <p className="text-sm text-muted-foreground">No failed payments.</p>}
            {failures.map(([reason, n]) => (
              <div key={reason} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="font-mono text-xs">{reason}</span>
                  <span className="tabular-nums">{n}</span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-destructive/70" style={{ width: `${(n / maxFailure) * 100}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
