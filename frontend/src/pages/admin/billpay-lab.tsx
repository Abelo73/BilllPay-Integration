import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, FlaskConical, Loader2, RefreshCw, RotateCcw, ShieldAlert, Webhook } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isAdmin } from '@/lib/admin-api'
import { labApi, type LabCall, type LabCreate, type LabDetail, type LabRun } from '@/lib/billpay-lab-api'
import { formatDate, formatETB } from '@/lib/format'
import { cn } from '@/lib/utils'
import { JsonBlock, PageHeader } from './shared'

/** What to type on BillPay's sandbox checkout page to get each outcome (Dashboard → Developers → Testing). */
const SCENARIOS: [string, string][] = [
  ['Any other number, or tok_success', 'Paid after a few seconds'],
  ['Ends in 0000, or tok_insufficient_funds', 'Refused: INSUFFICIENT_FUNDS'],
  ['Ends in 1111, or tok_declined', 'Refused: CUSTOMER_DECLINED'],
  ['Ends in 2222', 'Refused: ACCOUNT_BLOCKED'],
  ['Ends in 3333', 'Refused: LIMIT_EXCEEDED'],
  ['tok_expired_card', 'Refused: CARD_EXPIRED'],
  ['Ends in 8888', 'Paid after two minutes'],
  ['Ends in 9999, or tok_timeout', 'Never answered; expires'],
  ['Refund amount ending in .13', 'Refund refused: REFUND_REFUSED'],
]

const OP_LABEL: Record<string, string> = { create_payment: 'Create payment', get_payment: 'Check status', create_refund: 'Refund' }

function statusTone(s: string | null) {
  const v = (s ?? '').toUpperCase()
  if (/CAPTURED|SUCCEEDED|PAID|COMPLETED/.test(v)) return 'bg-success/15 text-success'
  if (/FAIL|REFUSED|DECLINED|EXPIRED|CANCEL/.test(v)) return 'bg-destructive/15 text-destructive'
  return 'bg-muted text-muted-foreground'
}

function CallRow({ c }: { c: LabCall }) {
  const [open, setOpen] = useState(false)
  const ok = c.httpStatus !== null && c.httpStatus < 300
  return (
    <li className="rounded-lg border">
      <button type="button" className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-sm" onClick={() => setOpen(!open)}>
        <span className="font-semibold">{OP_LABEL[c.operation] ?? c.operation}</span>
        <Badge variant="outline" className={cn('font-mono', ok ? 'border-success/40 text-success' : 'border-destructive/40 text-destructive')}>
          {c.httpStatus ?? 'no answer'}
        </Badge>
        <span className="text-xs text-muted-foreground">{c.durationMs} ms · {formatDate(c.at)}</span>
        <span className="ml-auto text-xs text-primary">{open ? 'Hide' : 'Show'} details</span>
      </button>
      {open && (
        <div className="space-y-3 border-t px-3 py-3">
          {c.error && <p className="text-xs text-destructive">{c.error}</p>}
          <JsonBlock label="We sent" raw={c.request} />
          <JsonBlock label="BillPay answered" raw={c.response} />
        </div>
      )}
    </li>
  )
}

function RunPanel({ id }: { id: string }) {
  const qc = useQueryClient()
  const admin = isAdmin()
  const { data, isLoading } = useQuery({ queryKey: ['lab-run', id], queryFn: () => labApi.detail(id), refetchInterval: 5_000 })
  const [refundAmount, setRefundAmount] = useState('')
  const [reason, setReason] = useState('')
  const done = (d: LabDetail) => { qc.setQueryData(['lab-run', id], d); qc.invalidateQueries({ queryKey: ['lab-runs'] }) }
  const refresh = useMutation({ mutationFn: () => labApi.refresh(id), onSuccess: (d) => { done(d); toast.success(`BillPay says: ${d.run.status ?? 'no status'}`) }, onError: (e) => toast.error(e.message) })
  const refund = useMutation({
    mutationFn: () => labApi.refund(id, Number(refundAmount || data?.run.amount), reason || undefined),
    onSuccess: (d) => { done(d); const last = d.calls[d.calls.length - 1]; toast[last?.httpStatus && last.httpStatus < 300 ? 'success' : 'error'](`Refund: HTTP ${last?.httpStatus ?? 'no answer'}`) },
    onError: (e) => toast.error(e.message),
  })
  if (isLoading || !data) return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Loading…</CardContent></Card>
  const r = data.run
  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="font-mono text-base">{r.merchantReference}</CardTitle>
          <Badge variant="outline" className={r.environment === 'LIVE' ? 'border-destructive/40 text-destructive' : ''}>{r.environment}</Badge>
          <Badge variant="outline" className={statusTone(r.status)}>{r.status ?? '—'}</Badge>
          <span className="ml-auto font-semibold tabular-nums">{formatETB(r.amount)}</span>
        </div>
        <CardDescription className="space-y-0.5">
          <span className="block">{r.description}{r.createdBy && ` · by ${r.createdBy}`} · {formatDate(r.createdAt)}</span>
          {r.billpayPaymentId && <span className="block font-mono text-xs">BillPay payment id: {r.billpayPaymentId}</span>}
        </CardDescription>
        <div className="flex flex-wrap gap-2">
          {r.checkoutUrl && (
            <Button asChild size="sm"><a href={r.checkoutUrl} target="_blank" rel="noreferrer"><ExternalLink /> Open BillPay checkout</a></Button>
          )}
          {r.billpayPaymentId && (
            <Button size="sm" variant="outline" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
              {refresh.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Check status at BillPay
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">API calls ({data.calls.length})</h3>
          <ul className="space-y-2">{data.calls.map((c) => <CallRow key={c.id} c={c} />)}</ul>
        </section>

        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Webhook className="size-4" /> Webhooks from BillPay ({data.webhooks.length})</h3>
          {data.webhooks.length === 0 && (
            <p className="text-xs text-muted-foreground">None yet. They arrive at the public URL (ngrok) a few seconds after paying; this page checks every 5 seconds.</p>
          )}
          <ul className="space-y-2">
            {data.webhooks.map((h, i) => (
              <li key={i} className="space-y-2 rounded-lg border px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{h.eventType ?? 'event'}</span>
                  <Badge variant="outline" className={h.signatureValid ? 'border-success/40 text-success' : 'border-destructive/40 text-destructive'}>
                    signature {h.signatureValid === null ? 'not checked' : h.signatureValid ? 'valid' : 'INVALID'}
                  </Badge>
                  {h.secondsAfterCreate !== null && <span className="text-xs text-muted-foreground">{h.secondsAfterCreate} s after creating</span>}
                  <span className="ml-auto text-xs text-muted-foreground">{h.receivedAt && formatDate(h.receivedAt)}</span>
                </div>
                {h.note && <p className="text-xs text-muted-foreground">{h.note}</p>}
                <JsonBlock label="Payload" raw={h.payload} />
              </li>
            ))}
          </ul>
        </section>

        {admin && r.billpayPaymentId && (
          <section className="space-y-2 rounded-lg border p-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><RotateCcw className="size-4" /> Refund</h3>
            <p className="text-xs text-muted-foreground">Sends {'{"amount", "reason"}'} to BillPay. In the sandbox, an amount ending in .13 is refused.</p>
            <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); refund.mutate() }}>
              <Input className="w-32" inputMode="decimal" placeholder={String(r.amount)} aria-label="Refund amount" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
              <Input className="min-w-40 flex-1" placeholder="Reason (optional)" aria-label="Refund reason" value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button type="submit" variant={r.environment === 'LIVE' ? 'destructive' : 'default'} disabled={refund.isPending}>
                {refund.isPending && <Loader2 className="animate-spin" />} Refund {r.environment === 'LIVE' && '(real money)'}
              </Button>
            </form>
          </section>
        )}
      </CardContent>
    </Card>
  )
}

function CreateForm({ onCreated }: { onCreated: (d: LabDetail) => void }) {
  const [form, setForm] = useState<LabCreate>({ environment: 'SANDBOX', amount: 10, description: '', customerPhone: '' })
  const [confirm, setConfirm] = useState(false)
  const live = form.environment === 'LIVE'
  const create = useMutation({
    mutationFn: () => labApi.create({ ...form, confirmLive: confirm }),
    onSuccess: (d) => {
      const c = d.calls[0]
      toast[d.run.checkoutUrl ? 'success' : 'error'](d.run.checkoutUrl ? 'Payment created. Open the checkout to pay.' : `BillPay refused: HTTP ${c?.httpStatus ?? 'no answer'}`)
      onCreated(d)
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <Card className={live ? 'border-destructive/50' : ''}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><FlaskConical className="size-4" /> New test payment</CardTitle>
        <CardDescription>Goes straight to BillPay: no order, no stock. Every call and webhook is kept below.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate() }}>
          <div className="flex gap-2" role="radiogroup" aria-label="Environment">
            {(['SANDBOX', 'LIVE'] as const).map((env) => (
              <Button key={env} type="button" size="sm" role="radio" aria-checked={form.environment === env}
                variant={form.environment === env ? (env === 'LIVE' ? 'destructive' : 'default') : 'outline'}
                onClick={() => { setForm({ ...form, environment: env }); setConfirm(false) }}>
                {env === 'SANDBOX' ? 'Sandbox (test money)' : 'Live (real money)'}
              </Button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="lab-amount">Amount (ETB)</Label>
              <Input id="lab-amount" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lab-phone">Customer phone (optional)</Label>
              <Input id="lab-phone" placeholder="+251911000000" value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lab-desc">Description (optional)</Label>
              <Input id="lab-desc" placeholder="BillPay lab test" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          {live && (
            <label className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm">
              <input type="checkbox" className="mt-1" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
              <span><ShieldAlert className="mr-1 inline size-4 text-destructive" />I understand this is a <b>real payment</b> with real money (at most 1,000 ETB). I can refund it here afterwards.</span>
            </label>
          )}
          <Button type="submit" disabled={create.isPending || !form.amount || (live && !confirm)} variant={live ? 'destructive' : 'default'}>
            {create.isPending && <Loader2 className="animate-spin" />} Create payment
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

/** Admin → BillPay lab: try BillPay directly and see exactly what it does. */
export function AdminBillPayLabPage() {
  const [params, setParams] = useSearchParams()
  const [selected, setSelected] = useState<string | null>(null)
  const runs = useQuery({ queryKey: ['lab-runs'], queryFn: labApi.list, refetchInterval: 10_000 })
  // coming back from BillPay's checkout: ?run=LAB-… opens that payment
  const fromRef = params.get('run')
  useEffect(() => {
    if (!fromRef || !runs.data) return
    const match = runs.data.find((r: LabRun) => r.merchantReference === fromRef)
    if (match) {
      setSelected(match.id) // eslint-disable-line react-hooks/set-state-in-effect
      setParams({}, { replace: true })
    }
  }, [fromRef, runs.data, setParams])
  const current = selected ?? runs.data?.[0]?.id ?? null
  return (
    <>
      <PageHeader title="BillPay lab" description="Make test payments straight against BillPay, then watch every API call, its timing, the webhooks and refunds." />
      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <div className="space-y-6">
          {isAdmin() && <CreateForm onCreated={(d) => { setSelected(d.run.id); runs.refetch() }} />}
          {current && <RunPanel key={current} id={current} />}
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Recent test payments</CardTitle></CardHeader>
            <CardContent className="divide-y p-0">
              {runs.data?.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-foreground">None yet.</p>}
              {runs.data?.map((r) => (
                <button key={r.id} type="button" onClick={() => setSelected(r.id)}
                  className={cn('flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-muted/50', r.id === current && 'bg-accent/50')}>
                  <span className="font-mono text-xs">{r.merchantReference}</span>
                  {r.environment === 'LIVE' && <Badge variant="outline" className="border-destructive/40 text-destructive">LIVE</Badge>}
                  <Badge variant="outline" className={statusTone(r.status)}>{r.status ?? '—'}</Badge>
                  <span className="ml-auto tabular-nums">{formatETB(r.amount)}</span>
                </button>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sandbox outcomes</CardTitle>
              <CardDescription>What to type on BillPay's sandbox checkout page.</CardDescription>
            </CardHeader>
            <CardContent className="divide-y p-0 text-sm">
              {SCENARIOS.map(([input, outcome]) => (
                <div key={input} className="flex justify-between gap-3 px-4 py-2">
                  <span className="font-mono text-xs">{input}</span>
                  <span className="text-right text-muted-foreground">{outcome}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
