import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'

import { ProblemThread } from '@/components/problem-thread'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { isAdmin } from '@/lib/admin-api'
import { PROBLEM_STATUS_LABEL, REASON_LABEL, problemAdminApi, type Outcome, type Problem } from '@/lib/dispute-api'
import { formatDate, formatETB } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PageHeader, Pager } from './shared'

/** Admin → Problems: buyers' reports on paid orders; the seller isn't paid until each is settled (M8). */
export function AdminProblemsPage() {
  const [show, setShow] = useState<'open' | 'closed'>('open')
  const [page, setPage] = useState(0)
  const q = useQuery({ queryKey: ['admin-problems', show, page], queryFn: () => problemAdminApi.list(show, page), placeholderData: keepPreviousData })
  return (
    <div className="space-y-4">
      <PageHeader title="Problems" description="Buyers' reports about paid orders. The seller isn't paid until you settle each one: refund, part refund, or pay the seller." />
      <Tabs value={show} onValueChange={(v) => { setShow(v as typeof show); setPage(0) }}>
        <TabsList>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="closed">Settled</TabsTrigger>
        </TabsList>
      </Tabs>
      {q.data?.content.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Nothing here.</p>}
      <div className="space-y-2">
        {q.data?.content.map((r) => (
          <Link key={r.id} to={`/admin/problems/${r.id}`} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 text-sm hover:bg-muted/50">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">#{r.id} · {REASON_LABEL[r.reason]} · order {r.parcelNumber}</span>
              <span className="block text-xs text-muted-foreground">
                {r.buyerName} vs {r.shopName} · {formatETB(r.parcelTotal)} · reported {formatDate(r.createdAt)}
                {r.status === 'OPEN' && (r.sellerRepliedAt ? ' · seller answered' : ' · seller hasn’t answered')}
              </span>
            </span>
            <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', r.status === 'OPEN' ? 'bg-market/20 text-market-deep' : 'bg-muted')}>
              {PROBLEM_STATUS_LABEL[r.status]}{r.refundAmount ? ` ${formatETB(r.refundAmount)}` : ''}
            </span>
          </Link>
        ))}
      </div>
      {q.data && q.data.totalPages > 1 && <Pager page={page} totalPages={q.data.totalPages} onPage={setPage} />}
    </div>
  )
}

export function AdminProblemPage() {
  const id = Number(useParams().id)
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['admin-problem', id], queryFn: () => problemAdminApi.get(id) })
  const set = (p: Problem) => {
    qc.setQueryData(['admin-problem', id], p)
    qc.invalidateQueries({ queryKey: ['admin-problems'] })
    qc.invalidateQueries({ queryKey: ['admin-problem-count'] })
  }
  const send = useMutation({ mutationFn: (b: string) => problemAdminApi.message(id, b), onSuccess: set, onError: (e) => toast.error(e.message) })
  const p = q.data
  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit"><Link to="/admin/problems"><ArrowLeft /> Problems</Link></Button>
      {q.isLoading && <Loader2 className="size-5 animate-spin text-muted-foreground" />}
      {p && (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Problem #{p.id}: {p.buyerName} vs {p.shopName}</CardTitle>
              <p className="text-sm text-muted-foreground">
                Buyer phone {p.buyerPhone ?? '—'} · <Link className="underline" to={`/admin/orders/${p.orderNumber}`}>order {p.orderNumber}</Link>
              </p>
            </CardHeader>
            <CardContent>
              <ProblemThread p={p} loadPhoto={(photoId) => problemAdminApi.photo(id, photoId)} onSend={isAdmin() ? (b) => send.mutate(b) : undefined} sending={send.isPending} />
            </CardContent>
          </Card>
          {p.status === 'OPEN' && isAdmin() && <Decide p={p} onDone={set} />}
          {p.status !== 'OPEN' && p.decidedBy && <p className="text-sm text-muted-foreground">Settled by {p.decidedBy} on {formatDate(p.resolvedAt)}.</p>}
        </div>
      )}
    </div>
  )
}

const OUTCOMES: { value: Outcome; label: string; note: string }[] = [
  { value: 'REFUND', label: 'Refund the buyer', note: 'The whole parcel back by BillPay; the seller gets nothing.' },
  { value: 'PART_REFUND', label: 'Part refund', note: 'Some money back; the seller is paid the rest.' },
  { value: 'PAY_SELLER', label: 'Pay the seller', note: 'No refund; the money is released to the seller.' },
]

function Decide({ p, onDone }: { p: Problem; onDone: (p: Problem) => void }) {
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const decide = useMutation({
    mutationFn: () => problemAdminApi.decide(p.id, outcome!, note, outcome === 'PART_REFUND' ? Number(amount) : undefined),
    onSuccess: (r) => { onDone(r); toast.success('Settled. Both sides got an SMS.') },
    onError: (e) => toast.error(e.message),
  })
  return (
    <Card className="h-fit border-primary/40">
      <CardHeader><CardTitle className="text-base">Settle it</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">The parcel cost the buyer {formatETB(p.parcelTotal)} (items and delivery).</p>
        <div className="space-y-2" role="group" aria-label="Decision">
          {OUTCOMES.map((o) => (
            <button key={o.value} type="button" aria-pressed={outcome === o.value} onClick={() => setOutcome(o.value)}
              className={cn('block w-full rounded-lg border p-3 text-left', outcome === o.value ? 'border-2 border-primary bg-primary/5' : 'hover:bg-muted')}>
              <span className="block text-sm font-semibold">{o.label}</span>
              <span className="block text-xs text-muted-foreground">{o.note}</span>
            </button>
          ))}
        </div>
        {outcome === 'PART_REFUND' && (
          <div className="space-y-1">
            <Label htmlFor="amount">Amount back to the buyer (ETB)</Label>
            <Input id="amount" type="number" min="1" step="0.01" max={p.parcelTotal} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="note">Decision (both sides see it)</Label>
          <Textarea id="note" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. The photos show the screen was cracked on arrival." />
        </div>
        <Button className="w-full" disabled={!outcome || !note.trim() || (outcome === 'PART_REFUND' && !(Number(amount) > 0)) || decide.isPending}
          onClick={() => { if (window.confirm('Settle this problem? Refunds go out through BillPay right away.')) decide.mutate() }}>
          {decide.isPending && <Loader2 className="animate-spin" />} Settle
        </Button>
      </CardContent>
    </Card>
  )
}
