import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { adminApi } from '@/lib/admin-api'
import { formatDate, formatETB } from '@/lib/format'
import { EmptyRow, PageHeader, Pager, StatusBadge } from './shared'

const STATUSES = ['PENDING_PAYMENT', 'PAYMENT_FAILED', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'EXPIRED', 'CANCELLED', 'REVIEW_REQUIRED']
const DELIVERY = ['UNFULFILLED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']

export function AdminOrdersPage() {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ''
  const fulfilment = params.get('fulfilment') ?? ''
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
    const t = setTimeout(() => search !== q && set('q', search || null), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const { data } = useQuery({
    queryKey: ['admin-orders', status, fulfilment, q, page],
    queryFn: () => adminApi.orders({ status, fulfilment, q, page }),
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
  })

  return (
    <>
      <PageHeader title="Orders" description="Every order, where its payment stands and how far delivery got." />
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Order number, customer or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={status || 'ALL'} onValueChange={(v) => set('status', v === 'ALL' ? null : v)}>
          <SelectTrigger className="w-full sm:w-52" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.replaceAll('_', ' ').toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fulfilment || 'ALL'} onValueChange={(v) => set('fulfilment', v === 'ALL' ? null : v)}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Delivery">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Any delivery</SelectItem>
            {DELIVERY.map((s) => (
              <SelectItem key={s} value={s}>
                {s.toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Delivery</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="pr-4 text-right">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.content.length === 0 && <EmptyRow colSpan={6} text="No orders match." />}
              {data?.content.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="pl-4">
                    <Link to={`/admin/orders/${o.orderNumber}`} className="font-mono text-sm font-medium hover:underline">
                      {o.orderNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{o.customerName}</div>
                    <div className="text-xs text-muted-foreground">{o.customerPhone}</div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={o.status} />
                  </TableCell>
                  <TableCell>
                    {o.fulfilmentStatus ? <StatusBadge status={o.fulfilmentStatus} /> : <span className="text-xs text-muted-foreground">—</span>}
                    {o.deliveryCity && <div className="mt-1 text-xs text-muted-foreground">{o.deliveryCity}</div>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatETB(o.total)}</TableCell>
                  <TableCell className="pr-4 text-right text-xs text-muted-foreground">{formatDate(o.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {data && <Pager page={page} totalPages={data.totalPages} onPage={(p) => set('page', String(p))} />}
    </>
  )
}
