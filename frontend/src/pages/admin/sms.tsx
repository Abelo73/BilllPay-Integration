import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { CheckCircle2, FlaskConical, Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { AdminTelegramCard } from '@/components/admin-telegram-card'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { adminApi } from '@/lib/admin-api'
import { formatDate } from '@/lib/format'
import { EmptyRow, PageHeader, Pager, StatusBadge } from './shared'

const KIND_LABEL: Record<string, string> = {
  SIGN_IN_CODE: 'Sign-in code',
  ORDER: 'Order update',
  PAYMENT: 'Payment',
  DELIVERY: 'Delivery',
  JOB: 'Job',
  CHAT: 'Chat',
  OTHER: 'Other',
}

export function AdminSmsPage() {
  const [page, setPage] = useState(0)
  const [status, setStatus] = useState('all')
  const [q, setQ] = useState('')
  const { data } = useQuery({
    queryKey: ['admin-sms', page, status, q],
    queryFn: () => adminApi.sms({ page, status: status === 'all' ? undefined : status, q: q || undefined }),
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
  })
  const setup = data?.setup
  return (
    <>
      <PageHeader
        title="SMS"
        description="Every text message: sign-in codes (stored masked, never readable here) and, later, order and delivery updates."
      />
      {setup && (
        <Card className={setup.delivering ? '' : 'border-warning/60'}>
          <CardContent className="flex items-start gap-3 py-4 text-sm">
            {setup.delivering ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
            ) : (
              <FlaskConical className="mt-0.5 size-5 shrink-0 text-warning" />
            )}
            <div className="space-y-1">
              <p className="font-semibold">
                {setup.delivering ? `Sending through AfroMessage${setup.sender ? ` as “${setup.sender}”` : ''}` : setup.switchedOff ? 'SMS switched off: nothing reaches phones, no credit used' : 'Test mode: nothing reaches phones'}
              </p>
              <p className="text-muted-foreground">
                {setup.delivering
                  ? setup.identifierSet
                    ? 'Identifier set. Failed messages show the reason AfroMessage gave.'
                    : 'No identifier id set, so AfroMessage uses the account default sender.'
                  : setup.switchedOff
                    ? 'AfroMessage is set up, but sending is switched off in Admin → Features → Messages. Texts are saved here as “logged”. Turn it back on before real customers use the site.'
                    : 'Add AFROMESSAGE_TOKEN (and AFROMESSAGE_IDENTIFIER_ID, AFROMESSAGE_SENDER) to .env and restart the backend to send real SMS. Until then messages are written to the backend log and listed here as “logged”.'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      <AdminTelegramCard />
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search by phone or order number"
            placeholder="Phone or order number"
            className="h-10 pl-9"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setPage(0)
            }}
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v)
            setPage(0)
          }}
        >
          <SelectTrigger className="h-10 w-40" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="SENT">Sent</SelectItem>
            <SelectItem value="FAILED">Failed</SelectItem>
            <SelectItem value="LOGGED">Logged (test)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Message</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.page.content.length === 0 && <EmptyRow colSpan={5} text="No SMS yet." />}
              {data?.page.content.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="pl-4">
                    <div className="text-sm font-medium">{KIND_LABEL[m.kind] ?? m.kind}</div>
                    <div className="max-w-96 truncate text-xs text-muted-foreground" title={m.body}>{m.body}</div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{m.recipient}</TableCell>
                  <TableCell>
                    {m.orderNumber ? (
                      <Link to={`/admin/orders/${m.orderNumber}`} className="font-mono text-sm hover:underline">{m.orderNumber}</Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadge status={m.status} />
                      {m.error && <span className="max-w-56 truncate text-[11px] text-destructive" title={m.error}>{m.error}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="pr-4 text-xs text-muted-foreground">{formatDate(m.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {data && <Pager page={page} totalPages={data.page.totalPages} total={data.page.totalElements} size={data.page.size} onPage={setPage} />}
    </>
  )
}
