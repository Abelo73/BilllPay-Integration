import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, CheckCircle2, CircleSlash, ExternalLink, FileText, Gauge, Loader2, Play, Square, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { isAdmin, loadTestApi, type LoadRun, type LoadStatus, type LoadTestDef } from '@/lib/admin-api'
import { ApiError } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { EmptyRow, PageHeader } from './shared'

const GRAFANA = 'http://localhost:8484/d/tenashop-app'

const ms = (v: number | null | undefined) => (v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`)
const pct = (v: number | null | undefined, digits = 1) => (v == null ? '—' : `${(v * 100).toFixed(digits)}%`)
const num = (v: number | null | undefined, digits = 0) => (v == null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: digits }))
const mins = (s: number) => (s < 60 ? `${s} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`)

const RESULT: Record<LoadRun['status'], { label: string; tone: string; icon: typeof CheckCircle2 }> = {
  running: { label: 'Running', tone: 'bg-brand/10 text-brand border-brand/30', icon: Loader2 },
  passed: { label: 'Passed', tone: 'bg-success/15 text-success border-success/30', icon: CheckCircle2 },
  failed: { label: 'Missed target', tone: 'bg-destructive/10 text-destructive border-destructive/30', icon: XCircle },
  stopped: { label: 'Stopped', tone: 'bg-muted text-muted-foreground', icon: CircleSlash },
  error: { label: 'Error', tone: 'bg-destructive/10 text-destructive border-destructive/30', icon: XCircle },
}

function ResultBadge({ status }: { status: LoadRun['status'] }) {
  const r = RESULT[status]
  return (
    <Badge variant="outline" className={cn('gap-1', r.tone)}>
      <r.icon className={cn('size-3', status === 'running' && 'animate-spin')} /> {r.label}
    </Badge>
  )
}

function Tile({ label, value, hint, bad }: { label: string; value: string; hint?: string; bad?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-xl font-semibold tabular-nums', bad && 'text-destructive')}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** Requests/s (bars) and p95 response time (line) over the run. */
function LiveChart({ points }: { points: NonNullable<LoadStatus['current']>['timeline'] }) {
  if (points.length < 2) return <div className="grid h-32 place-items-center text-xs text-muted-foreground">Collecting numbers…</div>
  const w = 600
  const h = 120
  const maxRps = Math.max(1, ...points.map((p) => p.rps))
  const maxP95 = Math.max(50, ...points.map((p) => p.p95 ?? 0))
  const x = (i: number) => (i / (points.length - 1)) * w
  const line = points.map((p, i) => `${x(i).toFixed(1)},${(h - ((p.p95 ?? 0) / maxP95) * (h - 8)).toFixed(1)}`).join(' ')
  const bw = Math.max(1, w / points.length - 1)
  return (
    <div className="space-y-1">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-32 w-full" preserveAspectRatio="none" role="img" aria-label="Requests per second and response time">
        {points.map((p, i) => (
          <rect key={i} x={x(i) - bw / 2} y={h - (p.rps / maxRps) * (h - 8)} width={bw} height={(p.rps / maxRps) * (h - 8)} className="fill-brand/25" />
        ))}
        <polyline points={line} fill="none" strokeWidth="2" className="stroke-warning" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-sm bg-brand/40" /> requests/s (max {num(maxRps, 1)})</span>
        <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-3 bg-warning" /> 95% response time (max {ms(maxP95)})</span>
      </div>
    </div>
  )
}

function LivePanel({ run }: { run: NonNullable<LoadStatus['current']> }) {
  const qc = useQueryClient()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const stop = useMutation({
    mutationFn: loadTestApi.stop,
    onSuccess: () => {
      toast.info('Stopping… k6 finishes the requests in flight and writes the report')
      qc.invalidateQueries({ queryKey: ['load-status'] })
    },
    onError: (e) => toast.error(e.message),
  })
  const elapsed = Math.round((now - new Date(run.startedAt).getTime()) / 1000)
  const total = run.duration + (run.test === 'smoke' ? 5 : 35) // ramp up and down around the hold time
  const live = run.live
  const isCheckout = run.test === 'checkout' || run.test === 'smoke'
  return (
    <Card className="border-brand/40">
      <CardHeader className="flex flex-row flex-wrap items-center gap-3 space-y-0">
        <Activity className="size-5 text-brand" />
        <div className="min-w-0 flex-1">
          <CardTitle className="text-base">{run.title} test running</CardTitle>
          <CardDescription>
            {run.vus} user{run.vus === 1 ? '' : 's'} · {mins(run.duration)} · started by {run.startedBy ?? 'admin'}
          </CardDescription>
        </div>
        {isAdmin() && (
          <Button variant="destructive" disabled={stop.isPending} onClick={() => stop.mutate()}>
            {stop.isPending ? <Loader2 className="animate-spin" /> : <Square />} Stop
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>{mins(Math.min(elapsed, total))} of about {mins(total)}</span>
            <span>{live ? `${num(live.requests)} requests so far` : 'Preparing (creating test data)…'}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${Math.min(100, (elapsed / total) * 100)}%` }} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Tile label="Users now" value={num(live?.vus)} />
          <Tile label="Requests / s" value={num(live?.rps, 1)} />
          <Tile label="95% respond within" value={ms(live?.p95)} hint={`average ${ms(live?.avg)}`} />
          <Tile label="Errors" value={pct(live?.errorRate, 2)} bad={(live?.errorRate ?? 0) > 0.01} />
          <Tile label="Checks passed" value={pct(live?.checks)} bad={live?.checks != null && live.checks < 0.99} />
          {isCheckout && <Tile label="Orders paid" value={num(live?.checkoutsPaid)} hint={`paid within ${ms(live?.timeToPaidP95)} (95%)`} />}
        </div>
        <LiveChart points={run.timeline} />
        <a href={GRAFANA} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-brand hover:underline">
          <ExternalLink className="size-3.5" /> Watch the shop's CPU, memory and database in Grafana
        </a>
      </CardContent>
    </Card>
  )
}

function StartPanel({ tests }: { tests: LoadTestDef[] }) {
  const qc = useQueryClient()
  const [testId, setTestId] = useState(tests[0]?.id ?? 'smoke')
  const test = tests.find((t) => t.id === testId) ?? tests[0]
  const [vus, setVus] = useState(test?.vus.default ?? 1)
  const [duration, setDuration] = useState(test?.duration.default ?? 30)
  const pick = (t: LoadTestDef) => {
    setTestId(t.id)
    setVus(t.vus.default)
    setDuration(t.duration.default)
  }
  const start = useMutation({
    mutationFn: () => loadTestApi.start({ test: testId, vus, duration }),
    onSuccess: () => {
      toast.success(`${test.title} test started`)
      qc.invalidateQueries({ queryKey: ['load-status'] })
    },
    onError: (e) => toast.error(e.message),
  })
  if (!test) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Start a test</CardTitle>
        <CardDescription>Run Smoke first. Then increase users step by step and watch where response times start to climb.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3">
          {tests.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => pick(t)}
              className={cn('rounded-xl border p-4 text-left transition hover:border-brand/60', t.id === testId && 'border-brand bg-brand/5 ring-1 ring-brand')}
            >
              <p className="flex items-center gap-2 font-medium"><Gauge className="size-4" /> {t.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
              {t.targets && (
                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {t.targets.map((x) => <li key={x}>✓ {x}</li>)}
                </ul>
              )}
            </button>
          ))}
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="lt-vus">Users at the same time: <span className="font-semibold tabular-nums">{vus}</span></Label>
            <input id="lt-vus" type="range" className="w-full accent-[var(--color-brand)]" min={test.vus.min} max={test.vus.max} value={vus}
              disabled={test.vus.min === test.vus.max} onChange={(e) => setVus(Number(e.target.value))} />
            <p className="text-xs text-muted-foreground">{test.vus.min}–{test.vus.max} (limited so this laptop stays usable)</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="lt-duration">How long at full load: <span className="font-semibold tabular-nums">{mins(duration)}</span></Label>
            <input id="lt-duration" type="range" className="w-full accent-[var(--color-brand)]" min={test.duration.min} max={test.duration.max} step={15} value={duration}
              onChange={(e) => setDuration(Number(e.target.value))} />
            <p className="text-xs text-muted-foreground">plus about 30 s to ramp up and down</p>
          </div>
        </div>
        {isAdmin() ? (
          <Button size="lg" disabled={start.isPending} onClick={() => start.mutate()}>
            {start.isPending ? <Loader2 className="animate-spin" /> : <Play />} Start {test.title.toLowerCase()} test
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">Only admins can start tests.</p>
        )}
      </CardContent>
    </Card>
  )
}

function History() {
  const { data } = useQuery({ queryKey: ['load-runs'], queryFn: loadTestApi.runs, refetchInterval: 10_000 })
  const open = useMutation({ mutationFn: loadTestApi.openReport, onError: (e) => toast.error(e.message) })
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Past runs</CardTitle>
        <CardDescription>"Missed target" means at least one goal (speed or errors) wasn't met; the report shows which.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">Started</TableHead>
              <TableHead>Test</TableHead>
              <TableHead>Result</TableHead>
              <TableHead className="text-right">Requests/s</TableHead>
              <TableHead className="text-right">95% within</TableHead>
              <TableHead className="text-right">Errors</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="pr-6 text-right">Report</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.length === 0 && <EmptyRow colSpan={8} text="No tests run yet." />}
            {data?.map((r) => {
              const missed = r.result?.thresholds.filter((t) => !t.ok) ?? []
              return (
                <TableRow key={r.id}>
                  <TableCell className="pl-6 text-xs text-muted-foreground">{formatDate(r.startedAt)}<div>{r.startedBy}</div></TableCell>
                  <TableCell>
                    <div className="font-medium">{r.title}</div>
                    <div className="text-xs text-muted-foreground">{r.vus} users · {mins(r.duration)}</div>
                  </TableCell>
                  <TableCell>
                    <ResultBadge status={r.status} />
                    {missed.map((t) => (
                      <div key={t.metric + t.rule} className="mt-1 font-mono text-[11px] text-destructive">{t.metric} {t.rule}</div>
                    ))}
                    {r.error && <div className="mt-1 max-w-64 truncate text-[11px] text-destructive" title={r.error}>{r.error}</div>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{num(r.result?.rps, 1)}</TableCell>
                  <TableCell className="text-right tabular-nums">{ms(r.result?.p95)}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(r.result?.errorRate, 2)}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(r.result?.checkoutsPaid)}</TableCell>
                  <TableCell className="pr-6 text-right">
                    {r.status !== 'running' && (
                      <Button size="sm" variant="outline" disabled={open.isPending} onClick={() => open.mutate(r.id)}>
                        <FileText /> Open
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export function AdminLoadTestsPage() {
  const qc = useQueryClient()
  const { data, error, isLoading } = useQuery({
    queryKey: ['load-status'],
    queryFn: loadTestApi.status,
    refetchInterval: (q) => (q.state.data?.current ? 2000 : 10_000),
    retry: false,
  })
  // when a run ends, refresh the history
  const running = !!data?.current
  useEffect(() => {
    if (!running) qc.invalidateQueries({ queryKey: ['load-runs'] })
  }, [running, qc])

  const down = error instanceof ApiError && error.code === 'RUNNER_DOWN'
  return (
    <>
      <PageHeader
        title="Load tests"
        description="Many simulated shoppers at once, to find how fast the shop is and where it breaks. Tests run against a separate copy of the shop with a fake BillPay: your orders, customers and BillPay are never touched."
      />
      {isLoading && <Loader2 className="animate-spin text-muted-foreground" />}
      {down && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">The test environment isn't running</CardTitle>
            <CardDescription>It's started separately because it uses a lot of memory while it runs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>In WSL, in the project folder:</p>
            <pre className="rounded-lg bg-muted p-3 font-mono text-xs">scripts/dev.sh perf</pre>
            <p className="text-muted-foreground">Then reload this page. <code className="font-mono">scripts/dev.sh perf-down</code> stops it again.</p>
          </CardContent>
        </Card>
      )}
      {error && !down && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      {data && (
        <>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline" className={data.targetUp ? 'border-success/40 text-success' : 'border-destructive/40 text-destructive'}>
              Test shop {data.targetUp ? 'up' : 'down'}
            </Badge>
            <Badge variant="outline" className={data.fakeBillPayUp ? 'border-success/40 text-success' : 'border-destructive/40 text-destructive'}>
              Fake BillPay {data.fakeBillPayUp ? 'up' : 'down'}
            </Badge>
            <Badge variant="outline">Numbers also go to Grafana: {data.metricsToPrometheus ? 'yes' : 'no'}</Badge>
          </div>
          {data.current ? <LivePanel run={data.current} /> : data.targetUp ? <StartPanel tests={data.tests} /> : (
            <p className="text-sm text-muted-foreground">The test shop is still starting (first start builds it, a few minutes). This page refreshes by itself.</p>
          )}
          <History />
        </>
      )}
    </>
  )
}
