import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { chatAdminApi, REPORT_REASON_LABEL } from '@/lib/chat-admin-api'
import { formatDate, formatETB } from '@/lib/format'
import { cn } from '@/lib/utils'
import { EmptyRow, PageHeader, Pager, StatusBadge } from './shared'

function ReportDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['admin-chat-report', id], queryFn: () => chatAdminApi.report(id) })
  const [note, setNote] = useState('')
  const [block, setBlock] = useState(true)
  const resolve = useMutation({
    mutationFn: () => chatAdminApi.resolve(id, note, block),
    onSuccess: () => {
      toast.success('Report resolved')
      qc.invalidateQueries({ queryKey: ['admin-chat-reports'] })
      onClose()
    },
    onError: (e) => toast.error(e.message),
  })
  const r = data?.report
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Reported chat: {r ? `${r.buyerName} ↔ ${r.shopName}` : '…'}</DialogTitle>
          <DialogDescription>
            {r && <>Reported by the {r.reporterSide === 'BUYER' ? 'buyer' : 'seller'}: {REPORT_REASON_LABEL[r.reason]}{r.details ? `. “${r.details}”` : ''}</>}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-96 space-y-2 overflow-y-auto rounded-xl border bg-muted/30 p-3">
          {!data && <Loader2 className="mx-auto animate-spin" />}
          {data?.thread.messages.map((m) => (
            <div key={m.id} className={cn('flex flex-col gap-0.5', m.senderRole === 'SELLER' ? 'items-end' : 'items-start')}>
              <span className="text-[11px] font-semibold text-muted-foreground">
                {m.senderRole === 'BUYER' ? r?.buyerName : m.senderRole === 'SELLER' ? r?.shopName : 'System'} · {formatDate(m.createdAt)}
              </span>
              <p className={cn('max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-1.5 text-sm', m.senderRole === 'SYSTEM' ? 'bg-muted' : 'border bg-card', m.flagged && 'border-destructive')}>
                {m.kind === 'IMAGE' && m.imageUrl ? <a href={m.imageUrl} target="_blank" rel="noreferrer" className="text-brand underline">Photo</a>
                  : m.kind === 'OFFER' && m.offer ? `Offer: ${formatETB(m.offer.unitPrice)} × ${m.offer.quantity} (${m.offer.status.toLowerCase()})`
                  : m.body}
              </p>
              {m.flagged && <span className="flex items-center gap-1 text-[11px] font-semibold text-destructive"><ShieldAlert className="size-3" /> flagged: possible off-platform deal</span>}
            </div>
          ))}
        </div>
        {r?.status === 'OPEN' ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="resolution">What did you do?</Label>
              <Textarea id="resolution" rows={2} maxLength={500} placeholder="e.g. Warned the seller by phone" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={block} onCheckedChange={setBlock} /> Block this conversation (the reported side can no longer write)
            </label>
          </div>
        ) : (
          r && <p className="text-sm text-muted-foreground">Resolved by {r.resolvedBy} on {formatDate(r.resolvedAt)}{r.resolution ? `: ${r.resolution}` : ''}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {r?.status === 'OPEN' && (
            <Button onClick={() => resolve.mutate()} disabled={resolve.isPending}>
              {resolve.isPending && <Loader2 className="animate-spin" />} Mark resolved
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Staff: chats someone reported. Unreported chats are never visible to staff. */
export function AdminChatReportsPage() {
  const [page, setPage] = useState(0)
  const [status, setStatus] = useState<'OPEN' | 'RESOLVED' | ''>('OPEN')
  const [open, setOpen] = useState<number | null>(null)
  const { data } = useQuery({
    queryKey: ['admin-chat-reports', status, page],
    queryFn: () => chatAdminApi.reports({ status, page }),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  })
  return (
    <>
      <PageHeader title="Chat reports" description="Conversations a buyer or seller reported. Staff can only read reported chats; everything else stays private." />
      <div className="flex gap-2">
        {(['OPEN', 'RESOLVED', ''] as const).map((s) => (
          <Button key={s || 'all'} size="sm" variant={status === s ? 'default' : 'outline'} aria-pressed={status === s} onClick={() => { setStatus(s); setPage(0) }}>
            {s === 'OPEN' ? 'Open' : s === 'RESOLVED' ? 'Resolved' : 'All'}
          </Button>
        ))}
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Chat</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Reported by</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.content.length === 0 && <EmptyRow colSpan={5} text="No reports here." />}
              {data?.content.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpen(r.id)}>
                  <TableCell className="pl-4">
                    <button type="button" className="text-left text-sm font-semibold hover:underline" onClick={() => setOpen(r.id)}>
                      {r.buyerName} ↔ {r.shopName}
                    </button>
                    {r.details && <div className="max-w-80 truncate text-xs text-muted-foreground">{r.details}</div>}
                  </TableCell>
                  <TableCell className="text-sm">{REPORT_REASON_LABEL[r.reason]}</TableCell>
                  <TableCell className="text-sm">{r.reporterSide === 'BUYER' ? 'Buyer' : 'Seller'}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="pr-4 text-xs text-muted-foreground">{formatDate(r.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {data && <Pager page={page} totalPages={data.totalPages} total={data.totalElements} size={data.size} onPage={setPage} />}
      {open !== null && <ReportDialog id={open} onClose={() => setOpen(null)} />}
    </>
  )
}
