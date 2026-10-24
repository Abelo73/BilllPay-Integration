import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Download, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { adminApi, type Report } from '@/lib/admin-api'
import { formatETB } from '@/lib/format'
import { EmptyRow, PageHeader } from './shared'

const RANGES = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
]

const pct = (v: number) => `${(v * 100).toFixed(1)}%`

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}

/** Revenue per day as simple bars; hover shows the numbers. */
function SalesChart({ days }: { days: Report['salesByDay'] }) {
  const max = Math.max(1, ...days.map((d) => d.revenue))
  const showEvery = days.length > 31 ? 14 : days.length > 10 ? 5 : 1
  return (
    <div className="flex h-48 items-end gap-[3px]" role="img" aria-label="Revenue per day">
      {days.map((d, i) => (
        <div key={d.day} className="group relative flex h-full flex-1 flex-col justify-end">
          <div
            className="rounded-t bg-brand/80 transition group-hover:bg-brand"
            style={{ height: `${Math.max(d.revenue > 0 ? 3 : 0, (d.revenue / max) * 100)}%` }}
          />
          <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs shadow group-hover:block">
            <div className="font-medium">{d.day}</div>
            <div>{formatETB(d.revenue)} · {d.paidOrders}/{d.orders} paid</div>
          </div>
          <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground">
            {i % showEvery === 0 ? d.day.slice(5) : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

export function AdminReportsPage() {
  const [days, setDays] = useState(30)
  const [downloading, setDownloading] = useState<string | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['admin-report', days],
    queryFn: () => adminApi.report(days),
    placeholderData: keepPreviousData,
  })

  const download = async (kind: 'orders' | 'payments') => {
    setDownloading(kind)
    try {
      await adminApi.downloadCsv(kind, days)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed')
    } finally {
      setDownloading(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Reports"
        description="Sales, best sellers and payment health. Export CSVs to match against BillPay's settlement report."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="w-40" aria-label="Range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => (
                  <SelectItem key={r.days} value={String(r.days)}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" disabled={!!downloading} onClick={() => download('orders')}>
              {downloading === 'orders' ? <Loader2 className="animate-spin" /> : <Download />} Orders CSV
            </Button>
            <Button variant="outline" disabled={!!downloading} onClick={() => download('payments')}>
              {downloading === 'payments' ? <Loader2 className="animate-spin" /> : <Download />} Payments CSV
            </Button>
          </div>
        }
      />

      {isLoading || !data ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Kpi label="Revenue" value={formatETB(data.totals.revenue)} hint={`${data.from} → ${data.to}`} />
            <Kpi label="Paid orders" value={String(data.totals.paidOrders)} hint={`of ${data.totals.orders} placed`} />
            <Kpi label="Average order" value={formatETB(data.totals.averageOrder)} />
            <Kpi label="Payment success" value={pct(data.totals.paymentSuccessRate)} hint="paid ÷ payments that ended" />
            <Kpi label="Refunded" value={formatETB(data.totals.refunded)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Revenue per day</CardTitle>
              <CardDescription>Paid orders by the day they were placed (Addis Ababa time).</CardDescription>
            </CardHeader>
            <CardContent className="pb-10">
              <SalesChart days={data.salesByDay} />
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top products</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Product</TableHead>
                      <TableHead className="text-right">Sold</TableHead>
                      <TableHead className="pr-6 text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.topProducts.length === 0 && <EmptyRow colSpan={3} text="No paid orders in this range." />}
                    {data.topProducts.map((p) => (
                      <TableRow key={p.productId}>
                        <TableCell className="pl-6">{p.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.quantity}</TableCell>
                        <TableCell className="pr-6 text-right tabular-nums">{formatETB(p.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Payment success by method</CardTitle>
                <CardDescription>NOT_CHOSEN = the shopper left BillPay before picking a method.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.byMethod.length === 0 && <p className="text-sm text-muted-foreground">No payments in this range.</p>}
                {data.byMethod.map((m) => (
                  <div key={m.method} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-mono text-xs">{m.method}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {m.succeeded}/{m.finished} · {pct(m.successRate)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-success" style={{ width: pct(m.successRate) }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Why payments failed</CardTitle>
              <CardDescription>Reason codes BillPay reported, including tries the shopper retried successfully.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {data.failureReasons.length === 0 && <p className="text-sm text-muted-foreground">No failures in this range.</p>}
              {data.failureReasons.map((r) => (
                <span key={r.reason} className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
                  <span className="font-mono text-xs">{r.reason}</span>
                  <span className="rounded-full bg-destructive/10 px-2 text-xs font-medium text-destructive tabular-nums">{r.count}</span>
                </span>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </>
  )
}
