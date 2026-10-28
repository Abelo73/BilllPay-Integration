import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, CircleDashed, Download, ExternalLink, FlaskConical, Gauge, KeyRound, ListChecks, Loader2, RefreshCw, RotateCcw, ShieldAlert, Webhook, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isAdmin } from '@/lib/admin-api'
import { labApi, type LabCall, type LabCreate, type LabDetail, type LabBoard, type LabKeyCheck, type LabRun, type LabVerdict } from '@/lib/billpay-lab-api'
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

/** BillPay has made up its mind: no point asking again. */
function isFinal(s: string | null) {
  return /CAPTURED|SUCCEEDED|PAID|COMPLETED|FAIL|REFUSED|DECLINED|EXPIRED|CANCEL|REFUND/.test((s ?? '').toUpperCase())
}

/** Sum of the refunds BillPay accepted (2xx), read from what we sent. */
function refundedSoFar(calls: LabCall[]) {
  return calls
    .filter((c) => c.operation === 'create_refund' && c.httpStatus !== null && c.httpStatus < 300 && c.request)
    .reduce((sum, c) => { try { return sum + Number(JSON.parse(c.request!).amount ?? 0) } catch { return sum } }, 0)
}

const round2 = (n: number) => Math.round(n * 100) / 100

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

const AUTO_EVERY_MS = 15_000
const AUTO_MAX_CHECKS = 40 // 10 minutes: long enough for the "paid after two minutes" scenario

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
  const [auto, setAuto] = useState(true)
  const [autoChecks, setAutoChecks] = useState(0)
  const autoBusy = useRef(false)
  const done = (d: LabDetail) => { qc.setQueryData(['lab-run', id], d); qc.invalidateQueries({ queryKey: ['lab-runs'] }) }
  const refresh = useMutation({ mutationFn: () => labApi.refresh(id), onSuccess: (d) => { done(d); toast.success(`BillPay says: ${d.run.status ?? 'no status'}`) }, onError: (e) => toast.error(e.message) })
  const refund = useMutation({
    mutationFn: () => labApi.refund(id, Number(refundAmount) || round2((data?.run.amount ?? 0) - refundedSoFar(data?.calls ?? [])), reason || undefined),
    onSuccess: (d) => { done(d); const last = d.calls[d.calls.length - 1]; toast[last?.httpStatus && last.httpStatus < 300 ? 'success' : 'error'](`Refund: HTTP ${last?.httpStatus ?? 'no answer'}`) },
    onError: (e) => toast.error(e.message),
  })
  const pending = !!data?.run.billpayPaymentId && !isFinal(data.run.status)
  const autoOn = auto && pending && autoChecks < AUTO_MAX_CHECKS
  // while BillPay hasn't settled, ask it for the status now and then (webhooks alone don't change the status here)
  useEffect(() => {
    if (!autoOn) return
    const t = setInterval(() => {
      if (autoBusy.current) return
      autoBusy.current = true
      labApi.refresh(id)
        .then((d) => done(d))
        .catch(() => undefined)
        .finally(() => { autoBusy.current = false; setAutoChecks((n) => n + 1) })
    }, AUTO_EVERY_MS)
    return () => clearInterval(t)
  }, [autoOn, id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (isLoading || !data) return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Loading…</CardContent></Card>
  const r = data.run
  const refunded = refundedSoFar(data.calls)
  const left = Math.max(0, round2(r.amount - refunded))
  const presets: [string, number][] = [['All that is left', left], ['Half', round2(left / 2)]]
  if (r.environment === 'SANDBOX') presets.push(['Refused (.13)', Math.max(0, Math.floor(r.amount) - 1) + 0.13])
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
          <Button size="sm" variant="ghost" onClick={() => download(`${r.merchantReference}.json`, data)}>
            <Download /> Export JSON
          </Button>
        </div>
        {pending && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); setAutoChecks(0) }} />
            {autoOn
              ? <span className="flex items-center gap-1"><Loader2 className="size-3 animate-spin" /> Asking BillPay every 15 s until it settles ({autoChecks}/{AUTO_MAX_CHECKS})</span>
              : autoChecks >= AUTO_MAX_CHECKS ? 'Stopped asking after 10 minutes. Tick to keep going.' : 'Ask BillPay for the status every 15 s'}
          </label>
        )}
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
            <p className="text-xs">
              Refunded so far <b className="tabular-nums">{formatETB(refunded)}</b> · left <b className="tabular-nums">{formatETB(left)}</b>
              {refunded > 0 && left === 0 && <span className="text-muted-foreground"> · asking for more shows how BillPay answers an over-refund</span>}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {presets.map(([label, v]) => (
                <Button key={label} type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setRefundAmount(v.toFixed(2))}>
                  {label}: {v.toFixed(2)}
                </Button>
              ))}
            </div>
            <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); refund.mutate() }}>
              <Input className="w-32" inputMode="decimal" placeholder={left.toFixed(2)} aria-label="Refund amount" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
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

const VERDICT_LOOK: Record<NonNullable<LabVerdict>, [string, string, typeof CheckCircle2]> = {
  PASS: ['Passed', 'border-success/40 text-success', CheckCircle2],
  FAIL: ['Failed', 'border-destructive/40 text-destructive', XCircle],
  WAITING: ['Waiting', 'text-muted-foreground', CircleDashed],
  NOT_STARTED: ['Not created', 'border-destructive/40 text-destructive', XCircle],
}

function VerdictBadge({ v }: { v: LabVerdict }) {
  if (!v) return <Badge variant="outline" className="text-muted-foreground">Not run</Badge>
  const [label, cls, Icon] = VERDICT_LOOK[v]
  return <Badge variant="outline" className={cn('gap-1', cls)}><Icon className="size-3" /> {label}</Badge>
}

/**
 * Scenario run: one sandbox payment per BillPay test case. BillPay decides by what is typed on its checkout page, so
 * a person pays each one; this card then asks BillPay every 15 s and marks each case passed or failed.
 */
function ScenarioCard({ onOpen }: { onOpen: (runId: string) => void }) {
  const qc = useQueryClient()
  const admin = isAdmin()
  const board = useQuery({ queryKey: ['lab-scenarios'], queryFn: labApi.scenarios })
  const set = (b: LabBoard) => { qc.setQueryData(['lab-scenarios'], b); qc.invalidateQueries({ queryKey: ['lab-runs'] }); qc.invalidateQueries({ queryKey: ['lab-stats'] }) }
  const start = useMutation({ mutationFn: labApi.startScenarios, onSuccess: (b) => { set(b); toast.success('8 sandbox payments created. Open each checkout and type what it says.') }, onError: (e) => toast.error(e.message) })
  const check = useMutation({ mutationFn: labApi.checkScenarios, onSuccess: set })
  const refunds = useMutation({ mutationFn: labApi.scenarioRefunds, onSuccess: set, onError: (e) => toast.error(e.message) })
  const b = board.data
  const waiting = (b?.waiting ?? 0) > 0
  // admins ask BillPay; support staff just reread what admins' checks found
  useEffect(() => {
    if (!waiting) return
    const t = setInterval(() => { if (admin) { if (!check.isPending) check.mutate() } else board.refetch() }, AUTO_EVERY_MS)
    return () => clearInterval(t)
  }, [waiting, admin]) // eslint-disable-line react-hooks/exhaustive-deps
  const paidPassed = b?.rows.find((r) => r.key === 'PAID')?.verdict === 'PASS'
  const refundsRun = b?.refunds.some((r) => r.verdict !== null)
  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base"><ListChecks className="size-4" /> Sandbox scenario run</CardTitle>
            <CardDescription>One test payment per BillPay case. Open each checkout, type what it says, and the result is checked for you.</CardDescription>
          </div>
          {admin && (
            <Button size="sm" disabled={start.isPending} onClick={() => { if (!b?.batch || window.confirm('Start a new run? It creates 8 new sandbox payments.')) start.mutate() }}>
              {start.isPending && <Loader2 className="animate-spin" />} {b?.batch ? 'New run' : 'Start a run'}
            </Button>
          )}
        </div>
        {b?.batch && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono text-muted-foreground">run {b.batch}</span>
            <Badge variant="outline" className="border-success/40 text-success">{b.passed} passed</Badge>
            {b.failed > 0 && <Badge variant="outline" className="border-destructive/40 text-destructive">{b.failed} failed</Badge>}
            {b.waiting > 0 && <Badge variant="outline">{b.waiting} waiting</Badge>}
            {waiting && <span className="flex items-center gap-1 text-muted-foreground"><Loader2 className="size-3 animate-spin" /> checking every 15 s</span>}
            {admin && (
              <Button size="xs" variant="ghost" className="ml-auto" disabled={check.isPending} onClick={() => check.mutate()}>
                {check.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Check now
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      {b?.batch && (
        <CardContent className="space-y-4 px-0">
          <ul className="divide-y border-y text-sm">
            {b.rows.map((r) => (
              <li key={r.key} className="space-y-1 px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{r.title}</span>
                  <VerdictBadge v={r.verdict} />
                  <span className="ml-auto flex gap-1">
                    {r.checkoutUrl && r.verdict === 'WAITING' && (
                      <Button asChild size="xs" variant="outline"><a href={r.checkoutUrl} target="_blank" rel="noreferrer"><ExternalLink /> Pay</a></Button>
                    )}
                    {r.runId && <Button size="xs" variant="ghost" onClick={() => onOpen(r.runId!)}>Details</Button>}
                  </span>
                </div>
                <p className="text-xs"><span className="text-muted-foreground">Type:</span> <span className="font-mono">{r.howTo}</span></p>
                <p className="text-xs text-muted-foreground">
                  Expect {r.expected}
                  {r.status && <> · BillPay: <span className="font-mono">{r.status}{r.reasonCode && ` (${r.reasonCode})`}</span></>}
                </p>
                {r.note && <p className={cn('text-xs', r.verdict === 'FAIL' || r.verdict === 'NOT_STARTED' ? 'text-destructive' : 'text-muted-foreground')}>{r.note}</p>}
              </li>
            ))}
          </ul>
          <div className="space-y-2 px-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><RotateCcw className="size-4" /> Refunds on the Paid payment</h3>
              {admin && (
                <Button size="xs" variant="outline" className="ml-auto" disabled={!paidPassed || refunds.isPending}
                  title={paidPassed ? undefined : 'Pay the "Paid" case first'} onClick={() => refunds.mutate()}>
                  {refunds.isPending && <Loader2 className="animate-spin" />} {refundsRun ? 'Test refunds again' : 'Test refunds'}
                </Button>
              )}
            </div>
            {!paidPassed && <p className="text-xs text-muted-foreground">Unlocks once the Paid case passes: refunds 1.00 (should be accepted) and 1.13 (the sandbox refuses it).</p>}
            {b.refunds.map((r) => (
              <div key={r.key} className="space-y-0.5 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.title} · {formatETB(r.amount)}</span>
                  <VerdictBadge v={r.verdict} />
                  {r.httpStatus !== null && <span className="font-mono text-muted-foreground">HTTP {r.httpStatus}</span>}
                  <span className="ml-auto text-muted-foreground">expect {r.expected}</span>
                </div>
                {r.note && <p className="text-muted-foreground">{r.note}</p>}
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

const VERDICT: Record<LabKeyCheck['verdict'], [string, string]> = {
  OK: ['Key accepted', 'border-success/40 text-success'],
  KEY_REJECTED: ['Key rejected', 'border-destructive/40 text-destructive'],
  NOT_SET: ['Not set', 'text-muted-foreground'],
  UNREACHABLE: ['No answer', 'border-destructive/40 text-destructive'],
  BILLPAY_ERROR: ['BillPay error', 'border-destructive/40 text-destructive'],
  UNEXPECTED: ['Unexpected', 'border-destructive/40 text-destructive'],
}

/** Does BillPay accept our keys? Asks for a payment that cannot exist: "not found" = key OK, 401 = key wrong. */
function KeyCheckCard() {
  const check = useMutation({ mutationFn: labApi.checkKeys, onError: (e) => toast.error(e.message) })
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="size-4" /> API keys</CardTitle>
          <CardDescription>Checks both keys from .env with BillPay. Creates nothing.</CardDescription>
        </div>
        <Button size="sm" variant="outline" disabled={check.isPending} onClick={() => check.mutate()}>
          {check.isPending && <Loader2 className="animate-spin" />} Check keys
        </Button>
      </CardHeader>
      {check.data && (
        <CardContent className="space-y-2">
          {check.data.map((k) => (
            <div key={k.environment} className="space-y-0.5 rounded-lg border px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{k.environment === 'LIVE' ? 'Live' : 'Sandbox'}</span>
                <Badge variant="outline" className={VERDICT[k.verdict][1]}>{VERDICT[k.verdict][0]}</Badge>
                {k.httpStatus !== null && <span className="font-mono text-xs text-muted-foreground">HTTP {k.httpStatus}</span>}
                {k.durationMs !== null && <span className="ml-auto text-xs text-muted-foreground">{k.durationMs} ms</span>}
              </div>
              <p className="text-xs text-muted-foreground">{k.message}</p>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  )
}

/** Speed and reliability of every BillPay call the lab has made. */
function StatsCard() {
  const { data } = useQuery({ queryKey: ['lab-stats'], queryFn: labApi.stats, refetchInterval: 30_000 })
  if (!data || data.operations.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Gauge className="size-4" /> How BillPay has been doing</CardTitle>
        <CardDescription>Every lab call so far. p95: 95 of 100 calls were at least this fast.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-4 py-1.5 text-left font-medium">Call</th>
                <th className="px-2 py-1.5 text-right font-medium">OK</th>
                <th className="px-2 py-1.5 text-right font-medium">Failed</th>
                <th className="px-2 py-1.5 text-right font-medium">Avg</th>
                <th className="px-4 py-1.5 text-right font-medium">p95</th>
              </tr>
            </thead>
            <tbody className="divide-y tabular-nums">
              {data.operations.map((o) => (
                <tr key={o.environment + o.operation}>
                  <td className="px-4 py-1.5">
                    {OP_LABEL[o.operation] ?? o.operation}
                    {o.environment === 'LIVE' && <Badge variant="outline" className="ml-1.5 border-destructive/40 text-destructive">LIVE</Badge>}
                  </td>
                  <td className="px-2 py-1.5 text-right">{o.ok}/{o.calls}</td>
                  <td className={cn('px-2 py-1.5 text-right', o.failed + o.noAnswer > 0 && 'text-destructive')}>
                    {o.failed}{o.noAnswer > 0 && ` +${o.noAnswer} no answer`}
                  </td>
                  <td className="px-2 py-1.5 text-right">{o.avgMs} ms</td>
                  <td className="px-4 py-1.5 text-right" title={`slowest ${o.maxMs} ms`}>{o.p95Ms} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-1.5 px-4">
          {data.outcomes.map((o) => (
            <Badge key={o.environment + o.status} variant="outline" className={statusTone(o.status)}>
              {o.environment === 'LIVE' && 'LIVE '}{o.status} · {o.runs}
            </Badge>
          ))}
        </div>
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
  const [envFilter, setEnvFilter] = useState<'ALL' | 'SANDBOX' | 'LIVE'>('ALL')
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
  const shown = runs.data?.filter((r) => envFilter === 'ALL' || r.environment === envFilter)
  return (
    <>
      <PageHeader title="BillPay lab" description="Make test payments straight against BillPay, then watch every API call, its timing, the webhooks and refunds." />
      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <div className="space-y-6">
          {isAdmin() && <CreateForm onCreated={(d) => { setSelected(d.run.id); runs.refetch() }} />}
          <ScenarioCard onOpen={setSelected} />
          {current && <RunPanel key={current} id={current} />}
        </div>
        <div className="space-y-6">
          {isAdmin() && <KeyCheckCard />}
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">Recent test payments</CardTitle>
              <div className="flex gap-1" role="radiogroup" aria-label="Show">
                {(['ALL', 'SANDBOX', 'LIVE'] as const).map((f) => (
                  <Button key={f} type="button" size="sm" className="h-7 px-2 text-xs" role="radio" aria-checked={envFilter === f}
                    variant={envFilter === f ? 'secondary' : 'ghost'} onClick={() => setEnvFilter(f)}>
                    {f === 'ALL' ? 'All' : f === 'SANDBOX' ? 'Sandbox' : 'Live'}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="divide-y p-0">
              {shown?.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-foreground">None yet.</p>}
              {shown?.map((r) => (
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
          <StatsCard />
        </div>
      </div>
    </>
  )
}
