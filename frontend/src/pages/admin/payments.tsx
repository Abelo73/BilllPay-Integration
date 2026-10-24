import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { adminApi, isAdmin } from '@/lib/admin-api'
import { formatDate, formatETB } from '@/lib/format'
import { EmptyRow, PageHeader, Pager, StatusBadge } from './shared'

const STATUSES = ['CREATED', 'ERROR', 'PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED']

export function AdminPaymentsPage() {
  const [params] = useSearchParams()
  // the dashboard links here with ?status=PENDING
  const [status, setStatus] = useState(params.get('status') ?? '')
  const [page, setPage] = useState(0)
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['admin-payments', status, page],
    queryFn: () => adminApi.payments({ status, page }),
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
  })
  const reconcile = useMutation({
    mutationFn: adminApi.reconcile,
    onSuccess: (r) => {
      toast.info(`Status check: ${r.outcome} → ${r.status}`)
      qc.invalidateQueries({ queryKey: ['admin-payments'] })
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <>
      <PageHeader
        title="Payments"
        description="Every BillPay payment attempt. An order gets a new attempt each time a shopper retries after a failure."
        actions={
          <Select
            value={status || 'ALL'}
            onValueChange={(v) => {
              setStatus(v === 'ALL' ? '' : v)
              setPage(0)
            }}
          >
            <SelectTrigger className="w-44" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Reference</TableHead>
                <TableHead>BillPay id</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.content.length === 0 && <EmptyRow colSpan={7} text="No payments yet." />}
              {data?.content.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="pl-4">
                    <Link to={`/admin/orders/${a.orderNumber}`} className="font-mono text-sm hover:underline">
                      {a.merchantReference}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-40 truncate font-mono text-xs text-muted-foreground">{a.billpayPaymentId ?? '—'}</TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadge status={a.status} />
                      {a.reasonCode && <span className="font-mono text-[11px] text-destructive">{a.reasonCode}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">{a.paymentMethod ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatETB(a.amount)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(a.createdAt)}</TableCell>
                  <TableCell className="pr-4 text-right">
                    {isAdmin() && a.billpayPaymentId && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Check with BillPay"
                        title="Check with BillPay"
                        disabled={reconcile.isPending && reconcile.variables === a.id}
                        onClick={() => reconcile.mutate(a.id)}
                      >
                        {reconcile.isPending && reconcile.variables === a.id ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {data && <Pager page={page} totalPages={data.totalPages} total={data.totalElements} size={data.size} onPage={setPage} />}
    </>
  )
}
