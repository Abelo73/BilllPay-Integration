import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'

import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { adminApi } from '@/lib/admin-api'
import { formatDate, formatETB } from '@/lib/format'
import { EmptyRow, PageHeader, Pager, StatusBadge } from './shared'

export function AdminRefundsPage() {
  const [page, setPage] = useState(0)
  const { data } = useQuery({
    queryKey: ['admin-refunds', page],
    queryFn: () => adminApi.refunds({ page }),
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
  })
  return (
    <>
      <PageHeader title="Refunds" description="Start a refund from an order's page. Refunds made in the BillPay dashboard show up here as external." />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Reference</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="pr-4">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.content.length === 0 && <EmptyRow colSpan={5} text="No refunds yet." />}
              {data?.content.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="pl-4">
                    <Link to={`/admin/orders/${r.orderNumber}`} className="font-mono text-sm hover:underline">
                      {r.merchantReference}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadge status={r.status} />
                      {r.reasonCode && <span className="font-mono text-[11px] text-destructive">{r.reasonCode}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-56 truncate text-sm text-muted-foreground">
                    {r.external ? 'Issued outside TenaShop' : (r.reason ?? '—')}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatETB(r.amount)}</TableCell>
                  <TableCell className="pr-4 text-xs text-muted-foreground">{formatDate(r.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {data && <Pager page={page} totalPages={data.totalPages} onPage={setPage} />}
    </>
  )
}
