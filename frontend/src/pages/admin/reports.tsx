import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Download, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { adminApi, type BillPayEnv } from '@/lib/admin-api'
import { formatETB } from '@/lib/format'
import { BarList, Delta, TrendChart } from './charts'
import { EmptyRow, PageHeader } from './shared'

const RANGES = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
]

const pct = (v: number) => `${(v * 100).toFixed(1)}%`

function Kpi({ label, value, hint, delta }: { label: string; value: string; hint?: string; delta?: React.ReactNode }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="space-y-1 px-4">
        <p className="text-[13px] text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold tracking-tight tabular-nums">{value}</p>
        {delta}
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}

export function AdminReportsPage() {
  const [days, setDays] = useState(30)
  // undefined = the mode new orders use; test and real payments are never added together
  const [env, setEnv] = useState<BillPayEnv | undefined>(undefined)
  const [downloading, setDownloading] = useState<string | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['admin-report', days, env],
    queryFn: () => adminApi.report(days, env),
    placeholderData: keepPreviousData,
  })

  const download = async (kind: 'orders' | 'payments') => {
    setDownloading(kind)
    try {
      await adminApi.downloadCsv(kind, days, env ?? data?.environment)
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
        description={`Sales, best sellers and payment health${data ? ` for ${data.environment === 'LIVE' ? 'live (real money)' : 'sandbox (test)'} payments` : ''}. Export CSVs to match against BillPay's settlement report.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={env ?? data?.environment ?? 'SANDBOX'} onValueChange={(v) => setEnv(v as BillPayEnv)}>
              <SelectTrigger className="w-44" aria-label="Payments">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LIVE">Live payments</SelectItem>
                <SelectItem value="SANDBOX">Sandbox payments</SelectItem>
              </SelectContent>
            </Select>
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Kpi label="Revenue" value={formatETB(data.totals.revenue)} hint={`${data.from} → ${data.to}`} delta={<Delta current={data.totals.revenue} previous={data.previous?.revenue} label="vs previous" />} />
            <Kpi label="Paid orders" value={String(data.totals.paidOrders)} hint={`of ${data.totals.orders} placed`} delta={<Delta current={data.totals.paidOrders} previous={data.previous?.paidOrders} label="vs previous" />} />
            <Kpi label="Average order" value={formatETB(data.totals.averageOrder)} delta={<Delta current={data.totals.averageOrder} previous={data.previous?.averageOrder} label="vs previous" />} />
            <Kpi label="Payment success" value={pct(data.totals.paymentSuccessRate)} hint="paid ÷ payments that ended" delta={<Delta current={data.totals.paymentSuccessRate} previous={data.previous?.paymentSuccessRate} points label="vs previous" />} />
            <Kpi label="Refunded" value={formatETB(data.totals.refunded)} delta={<Delta current={data.totals.refunded} previous={data.previous?.refunded} goodWhenUp={false} label="vs previous" />} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Revenue per day</CardTitle>
              <CardDescription>Paid orders by the day they were placed (Addis Ababa time).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 px-2 sm:px-4">
              <TrendChart
                data={data.salesByDay}
                dataKey="revenue"
                height={280}
                tooltipRows={(pt) => [
                  { label: 'Revenue', value: formatETB(Number(pt.revenue)) },
                  { label: 'Paid orders', value: String(pt.paidOrders) },
                  { label: 'All orders', value: String(pt.orders) },
                ]}
              />
              <details className="rounded-lg border px-3 py-2 text-sm">
                <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground">Show the numbers per day</summary>
                <div className="mt-2 max-h-72 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Day</TableHead>
                        <TableHead className="text-right">Orders</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...data.salesByDay].reverse().map((d) => (
                        <TableRow key={d.day}>
                          <TableCell className="tabular-nums">{d.day}</TableCell>
                          <TableCell className="text-right tabular-nums">{d.orders}</TableCell>
                          <TableCell className="text-right tabular-nums">{d.paidOrders}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatETB(d.revenue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </details>
            </CardContent>
          </Card>

          <div className="grid gap-3 lg:grid-cols-2">
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
              <CardContent>
                <BarList
                  empty="No payments in this range."
                  max={1}
                  rows={data.byMethod.map((m) => ({
                    key: m.method,
                    label: <span className="font-mono text-xs">{m.method}</span>,
                    value: m.successRate,
                    display: `${m.succeeded}/${m.finished} · ${pct(m.successRate)}`,
                  }))}
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Why payments failed</CardTitle>
              <CardDescription>Reason codes BillPay reported, including tries the shopper retried successfully.</CardDescription>
            </CardHeader>
            <CardContent className="max-w-2xl">
              <BarList
                empty="No failures in this range."
                color="var(--destructive)"
                rows={data.failureReasons.map((r) => ({
                  key: r.reason,
                  label: <span className="font-mono text-xs">{r.reason}</span>,
                  value: r.count,
                  display: String(r.count),
                }))}
              />
            </CardContent>
          </Card>
        </>
      )}
    </>
  )
}
