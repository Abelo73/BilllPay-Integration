// TenaShop load-test runner: starts k6 tests against the test copy of the shop and reports live numbers.
// Only the backend talks to it (Admin → Load tests); its port is published on 127.0.0.1 only.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

const PORT = Number(process.env.PORT || 9930)
const TARGET = process.env.TARGET || 'http://perf-backend:8282'
const FAKE_BILLPAY = process.env.FAKE_BILLPAY || 'http://perf-billpay:8080'
const PROMETHEUS_RW = process.env.PROMETHEUS_RW_URL || ''
const RUNS = process.env.RUNS_DIR || '/runner/runs'
const SCRIPTS = process.env.SCRIPTS_DIR || '/runner/k6'
fs.mkdirSync(RUNS, { recursive: true })

/** What can be run from the admin, with safe limits for a laptop. */
const TESTS = {
  smoke: {
    title: 'Smoke', description: 'One shopper browses and buys. Proves the setup works; run it first.',
    vus: { default: 1, min: 1, max: 1 }, duration: { default: 30, min: 15, max: 120 },
  },
  browse: {
    title: 'Browsing', description: 'Many shoppers look around: home, categories, products, search. Read-only.',
    vus: { default: 50, min: 1, max: 300 }, duration: { default: 60, min: 30, max: 600 },
    targets: ['95% of requests under 300 ms', 'under 1% errors'],
  },
  checkout: {
    title: 'Checkout', description: 'Shoppers sign up, check out, get paid by a signed BillPay webhook, and wait for PAID.',
    vus: { default: 20, min: 1, max: 150 }, duration: { default: 60, min: 30, max: 600 },
    targets: ['checkout 95% under 1.5 s (BillPay itself takes 0.3-0.8 s)', 'webhook 95% under 200 ms', 'paid within 5 s', 'under 1% errors'],
  },
  webhooks: {
    title: 'Webhook storm', description: 'BillPay sends a flood of webhooks: genuine, repeated, forged and unknown. Users = webhooks per second.',
    vus: { default: 100, min: 10, max: 500 }, duration: { default: 60, min: 30, max: 300 },
    targets: ['webhook answered 95% under 200 ms', 'forged ones refused', 'every order paid exactly once'],
  },
  rush: {
    title: 'Last-item rush', description: 'Many shoppers try to buy the last 10 units of a product at the same moment.',
    vus: { default: 100, min: 20, max: 300 }, duration: { default: 30, min: 30, max: 30 },
    targets: ['exactly 10 sold', 'everyone else gets a clean "sold out"', 'no errors'],
  },
  'billpay-slow': {
    title: 'BillPay slow', description: 'Every new BillPay payment takes 8 s. Shoppers keep browsing while a quarter of them check out.',
    script: 'billpay-trouble', env: { BILLPAY_MODE_UNDER_TEST: 'slow' }, fakeBillPay: 'slow',
    vus: { default: 40, min: 4, max: 200 }, duration: { default: 60, min: 30, max: 300 },
    targets: ['browsing stays under 500 ms (95%)', 'checkout still succeeds, within 11 s'],
  },
  'billpay-down': {
    title: 'BillPay down', description: 'Every new BillPay payment fails (503). Shoppers keep browsing while a quarter of them check out.',
    script: 'billpay-trouble', env: { BILLPAY_MODE_UNDER_TEST: 'down' }, fakeBillPay: 'down',
    vus: { default: 40, min: 4, max: 200 }, duration: { default: 60, min: 30, max: 300 },
    targets: ['browsing stays under 500 ms (95%)', 'checkout answers "try again" within 2 s, order kept'],
  },
}

/** Temporary fake-BillPay behaviour for a test; priority 1 beats the normal answers (priority 5). */
const FAKE_MODES = {
  slow: {
    priority: 1, request: { method: 'POST', url: '/api/v1/checkout/payments' },
    response: {
      status: 201, headers: { 'Content-Type': 'application/json' }, fixedDelayMilliseconds: 8000, transformers: ['response-template'],
      body: '{"statusCode":201,"message":"Payment created successfully","body":{"id":"perf-{{jsonPath request.body \'$.merchantReference\'}}","merchantReference":"{{jsonPath request.body \'$.merchantReference\'}}","status":"CREATED","amount":{"amount":{{jsonPath request.body \'$.amount\'}},"currency":"ETB"},"checkoutUrl":"https://sandbox.checkout.billpay.et/checkout/perf","attempts":[]}}',
    },
  },
  down: {
    priority: 1, request: { method: 'POST', url: '/api/v1/checkout/payments' },
    response: { status: 503, headers: { 'Content-Type': 'application/json' }, body: '{"statusCode":503,"message":"Service unavailable"}' },
  },
}

async function setFakeBillPay(mode) {
  // back to the normal answers from perf/fakebillpay/mappings, then add the trouble on top
  await fetch(`${FAKE_BILLPAY}/__admin/mappings/reset`, { method: 'POST' })
  if (mode && FAKE_MODES[mode]) {
    const r = await fetch(`${FAKE_BILLPAY}/__admin/mappings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(FAKE_MODES[mode]),
    })
    if (!r.ok) throw new Error(`could not switch the fake BillPay to "${mode}": HTTP ${r.status}`)
  }
}

let current = null // { meta, proc, timeline, last }
let starting = false // true while a start is preparing (two clicks must not start two tests)
const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}
const metaPath = (id) => path.join(RUNS, id, 'meta.json')
const saveMeta = (meta) => fs.writeFileSync(metaPath(meta.id), JSON.stringify(meta, null, 2))

async function reachable(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(3000) })
    return r.ok
  } catch {
    return false
  }
}

async function start(body) {
  if (current || starting) return [409, { code: 'RUN_IN_PROGRESS', detail: 'A test is already running. Stop it first.' }]
  const test = TESTS[body.test]
  if (!test) return [400, { code: 'UNKNOWN_TEST', detail: `No test "${body.test}".` }]
  const clamp = (v, r) => Math.max(r.min, Math.min(r.max, Math.round(Number(v ?? r.default))))
  const vus = clamp(body.vus, test.vus)
  const duration = clamp(body.duration, test.duration)
  const id = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '') + '-' + body.test
  const dir = path.join(RUNS, id)
  fs.mkdirSync(dir, { recursive: true })
  starting = true
  try {
    await setFakeBillPay(test.fakeBillPay) // normal answers unless this test needs trouble
  } catch (e) {
    starting = false
    return [502, { code: 'FAKE_BILLPAY_ERROR', detail: String(e.message || e) }]
  }
  const meta = {
    id, test: body.test, title: test.title, vus, duration, startedBy: body.startedBy ?? null,
    startedAt: new Date().toISOString(), finishedAt: null, status: 'running', exitCode: null, result: null,
  }
  saveMeta(meta)

  const args = ['run', '--address', '127.0.0.1:6565', '--tag', `testid=${id}`]
  const env = {
    ...process.env, ...(test.env || {}), TARGET, VUS: String(vus), DURATION: `${duration}s`,
    SUMMARY_PATH: path.join(dir, 'summary.json'),
    K6_WEB_DASHBOARD: 'true', K6_WEB_DASHBOARD_PORT: '-1', K6_WEB_DASHBOARD_EXPORT: path.join(dir, 'report.html'),
  }
  if (PROMETHEUS_RW) {
    args.push('-o', 'experimental-prometheus-rw')
    Object.assign(env, { K6_PROMETHEUS_RW_SERVER_URL: PROMETHEUS_RW, K6_PROMETHEUS_RW_TREND_STATS: 'p(95),p(99),avg,max' })
  }
  args.push(path.join(SCRIPTS, `${test.script || body.test}.js`))
  const log = fs.createWriteStream(path.join(dir, 'k6.log'))
  const proc = spawn('k6', args, { env })
  proc.stdout.pipe(log)
  proc.stderr.pipe(log)
  current = { meta, proc, timeline: [], last: null, stopRequested: false }
  starting = false
  proc.on('exit', (code) => finish(code))
  return [200, meta]
}

function finish(code) {
  if (!current) return
  const { meta, stopRequested } = current
  meta.finishedAt = new Date().toISOString()
  if (TESTS[meta.test]?.fakeBillPay) setFakeBillPay(null).catch(() => {}) // BillPay back to normal
  meta.exitCode = code
  meta.result = readResult(meta.id)
  // k6: 0 = all thresholds met, 99 = a threshold failed, anything else = the run itself broke
  meta.status = stopRequested ? 'stopped' : code === 0 ? 'passed' : code === 99 ? 'failed' : 'error'
  if (meta.status === 'error') {
    try {
      meta.error = fs.readFileSync(path.join(RUNS, meta.id, 'k6.log'), 'utf8').split('\n')
        .filter((l) => /level=error|ERRO|error/i.test(l)).slice(-3).join('\n').slice(0, 600)
    } catch { /* no log */ }
  }
  meta.timeline = current.timeline
  saveMeta(meta)
  current = null
}

/** Key numbers and each threshold's pass/fail from the summary k6 writes at the end. */
function readResult(id) {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(RUNS, id, 'summary.json'), 'utf8'))
    const m = s.metrics || {}
    const v = (name, key) => m[name]?.values?.[key] ?? null
    const thresholds = []
    for (const [name, metric] of Object.entries(m)) {
      for (const [rule, t] of Object.entries(metric.thresholds || {})) thresholds.push({ metric: name, rule, ok: t.ok })
    }
    return {
      requests: v('http_reqs', 'count'), rps: v('http_reqs', 'rate'),
      p95: v('http_req_duration', 'p(95)'), avg: v('http_req_duration', 'avg'), max: v('http_req_duration', 'max'),
      errorRate: v('http_req_failed', 'rate'), checks: v('checks', 'rate'),
      checkoutsPaid: v('checkouts_paid', 'count'), timeToPaidP95: v('time_to_paid', 'p(95)'),
      iterations: v('iterations', 'count'), thresholds,
    }
  } catch {
    return null
  }
}

/** Live numbers from k6's own REST API while a test runs. */
async function sample() {
  if (!current) return
  try {
    const r = await fetch('http://127.0.0.1:6565/v1/metrics', { signal: AbortSignal.timeout(1500) })
    const data = (await r.json()).data || []
    const m = Object.fromEntries(data.map((d) => [d.id, d.attributes.sample]))
    const now = Date.now()
    const reqs = m.http_reqs?.count ?? 0
    const prev = current.last
    const live = {
      t: new Date(now).toISOString(),
      vus: m.vus?.value ?? 0,
      requests: reqs,
      rps: prev ? Math.max(0, (reqs - prev.requests) / ((now - prev.at) / 1000)) : 0,
      p95: m.http_req_duration?.['p(95)'] ?? null,
      avg: m.http_req_duration?.avg ?? null,
      errorRate: m.http_req_failed?.rate ?? 0,
      checks: m.checks?.rate ?? null,
      checkoutsPaid: m.checkouts_paid?.count ?? null,
      timeToPaidP95: m.time_to_paid?.['p(95)'] ?? null,
    }
    current.last = { requests: reqs, at: now }
    current.live = live
    current.timeline.push({ t: live.t, vus: live.vus, rps: Math.round(live.rps * 10) / 10, p95: live.p95, errorRate: live.errorRate })
    if (current.timeline.length > 900) current.timeline.shift()
  } catch {
    // k6 not listening yet (setup still running) or already finished
  }
}
setInterval(sample, 2000)

function history() {
  return fs.readdirSync(RUNS).filter((d) => fs.existsSync(metaPath(d))).sort().reverse().slice(0, 50)
    .map((d) => {
      const { timeline, ...meta } = JSON.parse(fs.readFileSync(metaPath(d), 'utf8'))
      return meta
    })
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://runner')
  const parts = url.pathname.split('/').filter(Boolean)
  try {
    if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true })
    if (req.method === 'GET' && url.pathname === '/status') {
      const [target, billpay] = await Promise.all([reachable(`${TARGET}/actuator/health`), reachable(`${FAKE_BILLPAY}/__admin/health`)])
      return json(res, 200, {
        runner: true, target: TARGET, targetUp: target, fakeBillPayUp: billpay, metricsToPrometheus: !!PROMETHEUS_RW,
        tests: Object.entries(TESTS).map(([id, t]) => ({ id, ...t })),
        current: current ? { ...current.meta, live: current.live ?? null, timeline: current.timeline } : null,
      })
    }
    if (req.method === 'GET' && url.pathname === '/runs') return json(res, 200, history())
    if (req.method === 'POST' && url.pathname === '/runs') {
      const body = await new Promise((ok) => {
        let s = ''
        req.on('data', (c) => (s += c))
        req.on('end', () => ok(s ? JSON.parse(s) : {}))
      })
      const [status, out] = await start(body)
      return json(res, status, out)
    }
    if (req.method === 'POST' && url.pathname === '/runs/current/stop') {
      if (!current) return json(res, 409, { code: 'NOTHING_RUNNING', detail: 'No test is running.' })
      current.stopRequested = true
      current.proc.kill('SIGINT') // k6 stops gracefully and still writes its summary
      setTimeout(() => current?.proc.kill('SIGKILL'), 20000)
      return json(res, 200, { stopping: true })
    }
    if (req.method === 'GET' && parts[0] === 'runs' && parts.length === 3 && /^[\w-]+$/.test(parts[1])) {
      const file = { report: 'report.html', log: 'k6.log', meta: 'meta.json' }[parts[2]]
      const p = file && path.join(RUNS, parts[1], file)
      if (!p || !fs.existsSync(p)) return json(res, 404, { code: 'NOT_FOUND', detail: 'No such report.' })
      res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.json') ? 'application/json' : 'text/plain; charset=utf-8' })
      return fs.createReadStream(p).pipe(res)
    }
    json(res, 404, { code: 'NOT_FOUND', detail: 'Unknown path.' })
  } catch (e) {
    json(res, 500, { code: 'RUNNER_ERROR', detail: String(e.message || e) })
  }
})
server.listen(PORT, () => console.log(`load-test runner on :${PORT}, target ${TARGET}`))
