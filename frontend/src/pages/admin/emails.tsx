import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { adminApi, EMAIL_KIND_LABEL } from '@/lib/admin-api'
import { formatDate } from '@/lib/format'
import { EmptyRow, PageHeader, Pager, StatusBadge } from './shared'

export function AdminEmailsPage() {
  const [page, setPage] = useState(0)
  const { data } = useQuery({
    queryKey: ['admin-emails', page],
    queryFn: () => adminApi.notifications({ page }),
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
  })
  const mailbox = data?.mailboxUrl
  return (
    <>
      <PageHeader
        title="Emails"
        description="Every email sent to customers: order updates and account security. Duplicates from Kafka re-deliveries are never sent twice."
        actions={
          mailbox && (
            <Button asChild variant="outline">
              <a href={mailbox} target="_blank" rel="noreferrer">
                <ExternalLink /> Open test inbox
              </a>
            </Button>
          )
        }
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Email</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4">Sent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.page.content.length === 0 && <EmptyRow colSpan={5} text="No emails sent yet." />}
              {data?.page.content.map((n) => (
                <TableRow key={n.id}>
                  <TableCell className="pl-4">
                    <div className="text-sm font-medium">{EMAIL_KIND_LABEL[n.kind] ?? n.kind}</div>
                    <div className="max-w-80 truncate text-xs text-muted-foreground">{n.subject}</div>
                  </TableCell>
                  <TableCell className="text-sm">{n.recipient}</TableCell>
                  <TableCell>
                    {n.orderNumber ? (
                      <Link to={`/admin/orders/${n.orderNumber}`} className="font-mono text-sm hover:underline">
                        {n.orderNumber}
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadge status={n.status} />
                      {n.error && <span className="max-w-56 truncate text-[11px] text-destructive" title={n.error}>{n.error}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="pr-4 text-xs text-muted-foreground">{formatDate(n.sentAt ?? n.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {data && <Pager page={page} totalPages={data.page.totalPages} onPage={setPage} />}
    </>
  )
}
