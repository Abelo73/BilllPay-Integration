import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { adminApi, type Webhook } from '@/lib/admin-api'
import { formatDate } from '@/lib/format'
import { EmptyRow, JsonBlock, PageHeader, Pager, StatusBadge } from './shared'

const STATUSES = ['RECEIVED', 'PUBLISHED', 'PROCESSED', 'DUPLICATE', 'IGNORED', 'REJECTED', 'FAILED']

function SignatureIcon({ w }: { w: Webhook }) {
  if (w.signatureValid === true) return <ShieldCheck className="size-4 text-success" aria-label="Signature valid" />
  if (w.signatureValid === false) return <ShieldAlert className="size-4 text-destructive" aria-label="Signature invalid" />
  return <ShieldQuestion className="size-4 text-muted-foreground" aria-label="Signature not enforced" />
}

export function AdminWebhooksPage() {
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<Webhook | null>(null)
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['admin-webhooks', status, page],
    queryFn: () => adminApi.webhooks({ status, page }),
    placeholderData: keepPreviousData,
    refetchInterval: 5_000,
  })
  const replay = useMutation({
    mutationFn: adminApi.replayWebhook,
    onSuccess: () => {
      toast.success('Replayed. The processor should mark it DUPLICATE if it was already applied.')
      qc.invalidateQueries({ queryKey: ['admin-webhooks'] })
      setOpen(null)
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <>
      <PageHeader
        title="Webhooks"
        description="Everything BillPay has sent us, stored before processing. Open one to see headers, payload and the detected signature scheme."
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
                <TableHead className="pl-4">#</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Reported</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sig</TableHead>
                <TableHead className="pr-4">Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.content.length === 0 && (
                <EmptyRow colSpan={7} text="Nothing received yet. Send a test delivery from the BillPay dashboard (see BillPay setup)." />
              )}
              {data?.content.map((w) => (
                <TableRow key={w.id} className="cursor-pointer" onClick={() => setOpen(w)}>
                  <TableCell className="pl-4 font-mono text-xs">{w.id}</TableCell>
                  <TableCell className="text-sm">{w.eventType ?? '—'}</TableCell>
                  <TableCell className="max-w-48 truncate font-mono text-xs text-muted-foreground">
                    {w.merchantReference ?? w.billpayPaymentId ?? '—'}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{w.reportedStatus ?? '—'}</TableCell>
                  <TableCell>
                    <StatusBadge status={w.status} />
                  </TableCell>
                  <TableCell>
                    <SignatureIcon w={w} />
                  </TableCell>
                  <TableCell className="pr-4 text-xs text-muted-foreground">{formatDate(w.receivedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {data && <Pager page={page} totalPages={data.totalPages} onPage={setPage} />}

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        {open && (
          <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                Webhook #{open.id} <StatusBadge status={open.status} />
              </DialogTitle>
              <DialogDescription>
                {open.eventType ?? 'Unknown event'} · received {formatDate(open.receivedAt)}
                {open.processedAt && ` · processed ${formatDate(open.processedAt)}`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border p-3 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <SignatureIcon w={open} /> Signature
                </div>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {open.signatureValid === null ? 'not enforced' : open.signatureValid ? 'valid' : 'invalid'}
                  {open.signatureScheme && ` · ${open.signatureScheme}`}
                </p>
              </div>
              {open.error && <p className="rounded-lg bg-muted p-3 text-xs">{open.error}</p>}
              <JsonBlock label="Payload" raw={open.payload} />
              <JsonBlock label="Headers" raw={open.headers} />
              {open.status !== 'REJECTED' && (
                <Button variant="outline" onClick={() => replay.mutate(open.id)} disabled={replay.isPending}>
                  Replay through Kafka
                </Button>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  )
}
