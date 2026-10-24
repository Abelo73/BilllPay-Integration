import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, Banknote, Clock, CreditCard, Percent, ReceiptText, RotateCcw, ShoppingCart, Webhook } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { adminApi, type Report } from '@/lib/admin-api'
import { formatDate, formatETB } from '@/lib/format'
import { cn } from '@/lib/utils'
import { BarList, Delta, formatCompact, Sparkline, TrendChart, useCountUp } from './charts'
import { StatusBadge } from './shared'

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
] as const

const METRICS = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'paidOrders', label: 'Paid orders' },
  { key: 'orders', label: 'All orders' },
] as const

type Metric = (typeof METRICS)[number]['key']

/** A row of buttons acting as one choice (range, metric). */
function Segmented<T extends string | number>({ value, options, onChange, label }: {
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border bg-muted/40 p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-7 rounded-md px-2.5 text-xs font-medium transition-colors',
            o.value === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Kpi({ label, icon: Icon, value, format, delta, spark, index }: {
  label: string
  icon: typeof Banknote
  value: number
  format: (n: number) => string
  delta?: React.ReactNode
  spark?: React.ReactNode
  index: number
}) {
  const shown = useCountUp(value)
  return (
    <Card
      className="gap-0 overflow-hidden py-0 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 motion-safe:fill-mode-both"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <CardContent className="flex flex-col gap-1 p-4 pb-0">
        <div className="flex items-center justify-between">
          <p className="text-[13px] text-muted-foreground">{label}</p>
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{format(shown)}</p>
        <div className="min-h-5">{delta}</div>
      </CardContent>
      <div className="mt-1 h-10">{spark}</div>
    </Card>
  )
}

/** Small figure without a chart: icon, number, what it means, and where to look. */
function MiniStat({ icon: Icon, label, value, hint, to, alert }: {
  icon: typeof Clock
  label: string
  value: React.ReactNode
  hint: string
  to: string
  alert?: boolean
}) {
  return (
    <Link
      to={to}
      className={cn(
        'group flex items-center gap-3 rounded-xl border bg-card px-3.5 py-2.5 transition-colors hover:bg-muted/60',
        alert && 'border-warning/50 bg-warning/5',
      )}
    >
      <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg bg-muted', alert && 'bg-warning/15')}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-muted-foreground">{label}</span>
        <span className="block truncate text-xs text-muted-foreground/80">{hint}</span>
      </span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      <ArrowRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  )
}

function useSecondsAgo(timestamp: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return Math.max(0, Math.round((now - timestamp) / 1000))
}

function UpdatedBadge({ at, fetching }: { at: number; fetching: boolean }) {
  const ago = useSecondsAgo(at)
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
      <span className="relative flex size-2">
        {fetching && <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />}
        <span className="relative inline-flex size-2 rounded-full bg-success" />
      </span>
      {fetching ? 'Updating…' : ago < 5 ? 'Up to date' : `Updated ${ago}s ago`}
    </span>
  )
}

const METHOD_LABEL: Record<string, string> = {
  TEST_WALLET: 'Wallet (test)',
  TEST_BANK: 'Bank (test)',
  TEST_CARD: 'Card (test)',
  NOT_CHOSEN: 'Left before choosing',
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        <Skeleton className="h-80 rounded-xl xl:col-span-2" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  )
}

export function AdminDashboardPage() {
  const navigate = useNavigate()
  const [days, setDays] = useState<number>(30)
  const [metric, setMetric] = useState<Metric>('revenue')

  const live = useQuery({ queryKey: ['admin-dashboard'], queryFn: () => adminApi.dashboard(), refetchInterval: 15_000 })
  const report = useQuery({
    queryKey: ['admin-report', days, undefined],
    queryFn: () => adminApi.report(days),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  })
  const recent = useQuery({ queryKey: ['admin-orders-recent'], queryFn: () => adminApi.orders({ size: 6 }), refetchInterval: 15_000 })

  if (!live.data || !report.data) return <><Header days={days} setDays={setDays} /><DashboardSkeleton /></>

  const d = live.data
  const r: Report = report.data
  const t = r.totals
  const p = r.previous as Report['previous'] | undefined
  const vs = `vs previous ${days} days`
  const isLive = r.environment === 'LIVE'
  const review = d.ordersByStatus.REVIEW_REQUIRED ?? 0
  const statuses = Object.entries(d.ordersByStatus).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
  const series = r.salesByDay.map((x) => ({ ...x }))
  const metricFormat = metric === 'revenue' ? formatETB : (n: number) => String(Math.round(n))

  return (
    <>
      <Header days={days} setDays={setDays} at={Math.max(live.dataUpdatedAt, report.dataUpdatedAt)} fetching={live.isFetching || report.isFetching} live={isLive} />

      {review > 0 && (
        <Link
          to="/admin/orders?status=REVIEW_REQUIRED"
          className="flex items-center gap-3 rounded-xl border border-warning/50 bg-warning/10 px-4 py-2.5 text-sm hover:bg-warning/15"
        >
          <AlertTriangle className="size-4 shrink-0" />
          <span className="flex-1">
            {review} order{review > 1 ? 's need' : ' needs'} review (amount mismatch, late or duplicate payment).
          </span>
          <ArrowRight className="size-4" />
        </Link>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          index={0}
          label="Revenue"
          icon={Banknote}
          value={t.revenue}
          format={formatETB}
          delta={<Delta current={t.revenue} previous={p?.revenue} label={vs} />}
          spark={<Sparkline data={series} dataKey="revenue" />}
        />
        <Kpi
          index={1}
          label="Paid orders"
          icon={ShoppingCart}
          value={t.paidOrders}
          format={(n) => String(Math.round(n))}
          delta={<Delta current={t.paidOrders} previous={p?.paidOrders} label={vs} />}
          spark={<Sparkline data={series} dataKey="paidOrders" />}
        />
        <Kpi
          index={2}
          label="Payment success"
          icon={Percent}
          value={t.paymentSuccessRate * 100}
          format={(n) => `${n.toFixed(n % 1 === 0 ? 0 : 1)}%`}
          delta={<Delta current={t.paymentSuccessRate} previous={p?.paymentSuccessRate} points label={vs} />}
        />
        <Kpi
          index={3}
          label="Average order"
          icon={ReceiptText}
          value={t.averageOrder}
          format={formatETB}
          delta={<Delta current={t.averageOrder} previous={p?.averageOrder} label={vs} />}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat icon={Clock} label="Pending payments" value={d.pendingPayments} hint="Waiting for BillPay" to="/admin/payments?status=PENDING" />
        <MiniStat icon={Webhook} label="Webhooks queued" value={d.webhooksAwaitingProcessing} hint="Stored, not yet processed" to="/admin/webhooks" alert={d.webhooksAwaitingProcessing > 0} />
        <MiniStat icon={RotateCcw} label="Refunded" value={formatCompact(t.refunded)} hint={`ETB, last ${days} days`} to="/admin/refunds" />
        <MiniStat icon={CreditCard} label="All orders" value={t.orders} hint={`Placed in the last ${days} days`} to="/admin/orders" />
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="gap-2 xl:col-span-2">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
            <div>
              <CardTitle className="text-base">{METRICS.find((m) => m.key === metric)?.label} per day</CardTitle>
              <CardDescription>
                {formatDay(r.from)} – {formatDay(r.to)} · {isLive ? 'live payments' : 'sandbox (test) payments'}
              </CardDescription>
            </div>
            <Segmented label="Measure" value={metric} onChange={setMetric} options={METRICS.map((m) => ({ value: m.key, label: m.label }))} />
          </CardHeader>
          <CardContent className="px-2 sm:px-4">
            <TrendChart
              key={metric /* replay the draw-in when the measure changes */}
              data={series}
              dataKey={metric}
              tooltipRows={(pt) => [
                { label: METRICS.find((m) => m.key === metric)!.label, value: metricFormat(Number(pt[metric])) },
                ...(metric !== 'revenue' ? [{ label: 'Revenue', value: formatETB(Number(pt.revenue)) }] : []),
                ...(metric !== 'paidOrders' ? [{ label: 'Paid orders', value: String(pt.paidOrders) }] : []),
                ...(metric !== 'orders' ? [{ label: 'All orders', value: String(pt.orders) }] : []),
              ]}
            />
          </CardContent>
        </Card>

        <Card className="gap-3">
          <CardHeader>
            <CardTitle className="text-base">Orders by status</CardTitle>
            <CardDescription>All {isLive ? 'live' : 'sandbox'} orders · click to open</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              empty="No orders yet. Place one from the store."
              rows={statuses.map(([s, n]) => ({ key: s, label: <StatusBadge status={s} />, value: n, display: String(n) }))}
              onRow={(row) => navigate(`/admin/orders?status=${row.key}`)}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        <Card className="gap-3">
          <CardHeader>
            <CardTitle className="text-base">Success by payment method</CardTitle>
            <CardDescription>Paid ÷ finished tries, last {days} days</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              empty="No finished payments in this period."
              max={1}
              rows={r.byMethod
                .filter((m) => m.finished > 0)
                .map((m) => ({
                  key: m.method,
                  label: METHOD_LABEL[m.method] ?? m.method.replaceAll('_', ' ').toLowerCase(),
                  value: m.successRate,
                  display: `${Math.round(m.successRate * 100)}% · ${m.succeeded}/${m.finished}`,
                  hint: `${m.succeeded} paid out of ${m.finished} finished tries`,
                }))}
            />
          </CardContent>
        </Card>

        <Card className="gap-3">
          <CardHeader>
            <CardTitle className="text-base">Why payments failed</CardTitle>
            <CardDescription>Failed tries by BillPay reason, last {days} days</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              empty="No failed payments in this period."
              color="var(--destructive)"
              rows={r.failureReasons.map((f) => ({
                key: f.reason,
                label: <span className="font-mono text-xs">{f.reason}</span>,
                value: f.count,
                display: String(f.count),
              }))}
            />
          </CardContent>
        </Card>

        <Card className="gap-3 lg:col-span-2 xl:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Top products</CardTitle>
            <CardDescription>By paid revenue, last {days} days</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              empty="Nothing sold in this period yet."
              rows={r.topProducts.slice(0, 5).map((tp) => ({
                key: String(tp.productId),
                label: tp.name,
                value: tp.revenue,
                display: formatETB(tp.revenue),
                hint: `${tp.quantity} sold`,
              }))}
              onRow={(row) => navigate(`/admin/products/${row.key}`)}
            />
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0 py-0">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b py-3">
          <CardTitle className="text-base">Latest orders</CardTitle>
          <Link to="/admin/orders" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
            All orders <ArrowRight className="size-3" />
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {recent.data && recent.data.content.length > 0 ? (
            <ul className="divide-y">
              {recent.data.content.map((o) => (
                <li key={o.id}>
                  <Link to={`/admin/orders/${o.orderNumber}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm transition-colors hover:bg-muted/50">
                    <span className="w-40 font-mono text-[13px] font-medium">
                      {o.orderNumber}
                      {o.environment === 'SANDBOX' && <span className="ml-1.5 rounded bg-warning/15 px-1 text-[10px] uppercase text-muted-foreground">test</span>}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{o.customerName}</span>
                    <StatusBadge status={o.status} />
                    <span className="w-28 text-right font-medium tabular-nums">{formatETB(o.total)}</span>
                    <span className="hidden w-36 text-right text-xs text-muted-foreground md:block">{formatDate(o.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No orders yet.</p>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function formatDay(day: string) {
  return new Date(`${day}T00:00:00`).toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

function Header({ days, setDays, at, fetching, live }: {
  days: number
  setDays: (d: number) => void
  at?: number
  fetching?: boolean
  live?: boolean
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-0.5">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {live === undefined ? 'Payments flowing through BillPay' : live ? 'Live payments (real money)' : 'Sandbox payments (test money)'}
          {at ? <UpdatedBadge at={at} fetching={!!fetching} /> : null}
        </p>
      </div>
      <Segmented label="Period" value={days} onChange={setDays} options={RANGES.map((r) => ({ value: r.days, label: r.label }))} />
    </div>
  )
}
