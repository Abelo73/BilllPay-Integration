import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Download, Loader2, RefreshCw, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { isAdmin, payoutAdminApi, type PayoutRow } from '@/lib/admin-api'
import { formatDate, formatETB } from '@/lib/format'
import { PageHeader, Pager } from './shared'

const METHOD: Record<string, string> = { BANK: 'Bank', TELEBIRR: 'telebirr', CBE_BIRR: 'CBE Birr', OTHER: 'Other' }

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}

type Decision = { row: PayoutRow; to: 'PAID' | 'REJECTED' }

function DecisionDialog({ decision, onClose }: { decision: Decision; onClose: () => void }) {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const paid = decision.to === 'PAID'
  const r = decision.row
  const save = useMutation({
    mutationFn: () => payoutAdminApi.decide(r.id, decision.to, paid ? text : undefined, paid ? undefined : text),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-payouts'] })
      qc.invalidateQueries({ queryKey: ['admin-trust-badges'] })
      toast.success(paid ? 'Marked as sent. The seller got an SMS with the reference.' : 'Not sent. The money is back in the seller\'s balance.')
      onClose()
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{paid ? 'Mark as sent' : 'Don\'t send'}: {formatETB(r.amount)} to {r.shopName}</DialogTitle>
          <DialogDescription>
            {METHOD[r.method] ?? r.method}{r.provider && ` (${r.provider})`} · {r.accountName} · <span className="font-mono">{r.account}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="decision-text">{paid ? 'Transfer reference (from the bank or wallet)' : 'Reason (the seller sees this)'}</Label>
          <Input id="decision-text" value={text} maxLength={paid ? 120 : 500} onChange={(e) => setText(e.target.value)}
            placeholder={paid ? 'e.g. FT2629812345' : 'e.g. The account number is wrong'} />
          {paid && <p className="text-xs text-muted-foreground">Send the money first in the bank or wallet app, then record it here.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Back</Button>
          <Button variant={paid ? 'default' : 'destructive'} disabled={!text.trim() || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="animate-spin" />} {paid ? 'Mark as sent' : 'Don\'t send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Admin → Payouts: money held for buyers, sellers' balances, payout requests to send. */
export function AdminPayoutsPage() {
  const qc = useQueryClient()
  const [status, setStatus] = useState('REQUESTED')
  const [page, setPage] = useState(0)
  const [decision, setDecision] = useState<Decision | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['admin-payouts', status, page],
    queryFn: () => payoutAdminApi.list(status, page),
    placeholderData: keepPreviousData,
  })
  const release = useMutation({
    mutationFn: payoutAdminApi.releaseDue,
    onSuccess: (r) => { toast.success(r.released ? `${r.released} delivered parcels released to sellers` : 'Nothing due yet'); qc.invalidateQueries({ queryKey: ['admin-payouts'] }) },
    onError: (e) => toast.error(e.message),
  })
  const t = data?.totals
  const admin = isAdmin()

  return (
    <>
      <PageHeader
        title="Payouts"
        description="Buyers' money is held until they confirm delivery (or 48 h after it). Sellers then ask for payouts; send them and record the reference."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => payoutAdminApi.csv().catch((e) => toast.error(e.message))}><Download /> CSV</Button>
            {admin && <Button variant="outline" size="sm" disabled={release.isPending} onClick={() => release.mutate()}><RefreshCw /> Release due now</Button>}
          </div>
        }
      />
      {t && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Tile label="Held for buyers" value={formatETB(t.held)} hint="Waiting for delivery" />
          <Tile label="Sellers can withdraw" value={formatETB(t.available)} />
          <Tile label="To send" value={formatETB(t.requested)} hint={`${t.requestedCount} request${t.requestedCount === 1 ? '' : 's'}`} />
          <Tile label="Paid out" value={formatETB(t.paidOut)} />
          <Tile label="Our commission" value={formatETB(t.commission)} hint="Not counting cancelled parcels" />
        </div>
      )}
      <Tabs value={status} onValueChange={(v) => { setStatus(v); setPage(0) }}>
        <TabsList>
          <TabsTrigger value="REQUESTED">To send <span className="ml-1 tabular-nums text-muted-foreground">{t?.requestedCount ?? 0}</span></TabsTrigger>
          <TabsTrigger value="PAID">Sent</TabsTrigger>
          <TabsTrigger value="REJECTED">Not sent</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="space-y-3">
        {!isLoading && data?.page.content.length === 0 && (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{status === 'REQUESTED' ? 'No payouts to send.' : 'None here.'}</CardContent></Card>
        )}
        {data?.page.content.map((r) => (
          <Card key={r.id}>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1 space-y-1 text-sm">
                <p className="font-semibold">{r.shopName} <span className="font-normal text-muted-foreground">· {r.shopPhone}</span></p>
                <p>
                  {METHOD[r.method] ?? r.method}{r.provider && ` (${r.provider})`} · {r.accountName} · <span className="font-mono">{r.account}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Asked {formatDate(r.requestedAt)}{r.decidedAt && ` · ${r.status === 'PAID' ? 'sent' : 'declined'} ${formatDate(r.decidedAt)} by ${r.decidedBy}`}
                  {r.reference && ` · ref ${r.reference}`}{r.note && ` · ${r.note}`}
                </p>
              </div>
              <p className="text-xl font-semibold tabular-nums">{formatETB(r.amount)}</p>
              {admin && r.status === 'REQUESTED' && (
                <div className="flex gap-2 sm:flex-col">
                  <Button size="sm" onClick={() => setDecision({ row: r, to: 'PAID' })}><Check /> Mark sent</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDecision({ row: r, to: 'REJECTED' })}><X /> Don't send</Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      {data && <Pager page={page} totalPages={data.page.totalPages} total={data.page.totalElements} size={data.page.size} onPage={setPage} />}
      {decision && <DecisionDialog decision={decision} onClose={() => setDecision(null)} />}
    </>
  )
}
