// Generates the provisioned Grafana dashboards (monitoring/grafana/dashboards/*.json).
// Edit the panels here, then run: node monitoring/grafana/generate-dashboards.mjs
import fs from 'node:fs'
import path from 'node:path'

const OUT = path.join(import.meta.dirname, 'dashboards')
fs.mkdirSync(OUT, { recursive: true })
const DS = { type: 'prometheus', uid: 'prometheus' }
let id = 0

const target = (expr, legend = '', refId = 'A', extra = {}) => ({ datasource: DS, expr, legendFormat: legend, refId, ...extra })
const targets = (list) => list.map(([expr, legend, extra], i) => target(expr, legend, String.fromCharCode(65 + i), extra))

function stat(title, exprs, { x, y, w = 6, h = 4, unit = 'short', decimals, thresholds, description, colorMode = 'value', mappings } = {}) {
  return {
    id: ++id, type: 'stat', title, description, datasource: DS, gridPos: { x, y, w, h },
    targets: targets(exprs.map((e) => (Array.isArray(e) ? e : [e, '', { instant: true }]))),
    fieldConfig: {
      defaults: {
        unit, decimals, mappings: mappings ?? [],
        thresholds: thresholds ?? { mode: 'absolute', steps: [{ color: 'blue', value: null }] },
        color: { mode: 'thresholds' },
      },
      overrides: [],
    },
    options: { reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false }, colorMode, graphMode: 'none', textMode: 'auto', justifyMode: 'auto' },
  }
}

function ts(title, exprs, { x, y, w = 12, h = 8, unit = 'short', stack = false, description, bars = false } = {}) {
  return {
    id: ++id, type: 'timeseries', title, description, datasource: DS, gridPos: { x, y, w, h },
    targets: targets(exprs),
    fieldConfig: {
      defaults: {
        unit,
        custom: {
          drawStyle: bars ? 'bars' : 'line', lineWidth: 2, fillOpacity: bars ? 80 : 12, showPoints: 'never',
          spanNulls: true, stacking: { mode: stack ? 'normal' : 'none', group: 'A' }, axisSoftMin: 0,
        },
        color: { mode: 'palette-classic' },
      },
      overrides: [],
    },
    options: { legend: { displayMode: 'list', placement: 'bottom', showLegend: true }, tooltip: { mode: 'multi', sort: 'desc' } },
  }
}

function barGauge(title, expr, legend, { x, y, w = 12, h = 8, unit = 'short', description } = {}) {
  return {
    id: ++id, type: 'bargauge', title, description, datasource: DS, gridPos: { x, y, w, h },
    targets: [target(expr, legend, 'A', { instant: true })],
    fieldConfig: { defaults: { unit, color: { mode: 'continuous-BlPu' }, min: 0 }, overrides: [] },
    options: { orientation: 'horizontal', displayMode: 'gradient', showUnfilled: true, reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false } },
  }
}

const row = (title, y) => ({ id: ++id, type: 'row', title, collapsed: false, gridPos: { x: 0, y, w: 24, h: 1 }, panels: [] })

function dashboard(uid, title, description, panels, tags) {
  return {
    uid, title, description, tags: ['tenashop', ...tags], editable: false, schemaVersion: 39, version: 1,
    time: { from: 'now-6h', to: 'now' }, refresh: '30s', timezone: 'browser', graphTooltip: 1,
    templating: { list: [] }, annotations: { list: [] },
    links: [
      { title: 'Payments', type: 'link', url: '/d/tenashop-payments', icon: 'dashboard' },
      { title: 'Webhooks & Kafka', type: 'link', url: '/d/tenashop-webhooks', icon: 'dashboard' },
      { title: 'App', type: 'link', url: '/d/tenashop-app', icon: 'dashboard' },
    ],
    panels,
  }
}

const pct = { mode: 'absolute', steps: [{ color: 'red', value: null }, { color: 'orange', value: 0.7 }, { color: 'green', value: 0.9 }] }
const FINAL = 'SUCCEEDED|FAILED|EXPIRED|CANCELLED'

// ---------- Payments ----------
id = 0
const payments = dashboard('tenashop-payments', 'TenaShop · Payments', 'BillPay payment health: success rate, failures and API latency', [
  row('Selected time range', 0),
  stat('Success rate', [`sum(increase(tenashop_payments_status_total{status="SUCCEEDED"}[$__range])) / sum(increase(tenashop_payments_status_total{status=~"${FINAL}"}[$__range]))`],
    { x: 0, y: 1, unit: 'percentunit', decimals: 1, thresholds: pct, description: 'Paid ÷ all payments that ended (paid, failed, expired, cancelled)' }),
  stat('Paid', [`sum(increase(tenashop_payments_status_total{status="SUCCEEDED"}[$__range]))`], { x: 6, y: 1, decimals: 0, thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }] } }),
  stat('Payment links created', [`sum(increase(tenashop_payments_requested_total{result="created"}[$__range]))`], { x: 12, y: 1, decimals: 0 }),
  stat('Orders expired', [`sum(increase(tenashop_orders_status_total{status="EXPIRED"}[$__range]))`], { x: 18, y: 1, decimals: 0, thresholds: { mode: 'absolute', steps: [{ color: 'text', value: null }, { color: 'orange', value: 1 }] } }),
  row('Over time', 5),
  ts('Payments by outcome', [[`sum by (status) (increase(tenashop_payments_status_total[5m]))`, '{{status}}']], { x: 0, y: 6, bars: true, stack: true, description: 'Payment attempts reaching each status, per 5 minutes' }),
  ts('Payment link requests', [[`sum by (result) (increase(tenashop_payments_requested_total[5m]))`, '{{result}}']], { x: 12, y: 6, bars: true, stack: true, description: 'created = BillPay gave a checkout link; rejected = 4xx; error = 5xx or unreachable' }),
  barGauge('Failed tries by reason (since backend start)', `sort_desc(sum by (reason) (tenashop_payments_tries_failed_total))`, '{{reason}}', { x: 0, y: 14, description: 'Tries BillPay declined while keeping the payment open (INSUFFICIENT_FUNDS, CUSTOMER_DECLINED, ...)' }),
  barGauge('Paid by method (since backend start)', `sort_desc(sum by (method) (tenashop_payments_paid_total))`, '{{method}}', { x: 12, y: 14 }),
  row('BillPay API', 22),
  ts('BillPay latency (p95)', [[`histogram_quantile(0.95, sum by (le, operation) (rate(tenashop_billpay_requests_seconds_bucket[5m])))`, '{{operation}} p95'], [`histogram_quantile(0.5, sum by (le, operation) (rate(tenashop_billpay_requests_seconds_bucket[5m])))`, '{{operation}} p50']], { x: 0, y: 23, unit: 's' }),
  ts('BillPay calls by outcome', [[`sum by (operation, outcome) (increase(tenashop_billpay_requests_seconds_count[5m]))`, '{{operation}} {{outcome}}']], { x: 12, y: 23, bars: true, stack: true }),
  stat('BillPay error rate (5m)', [`(sum(rate(tenashop_billpay_requests_seconds_count{outcome=~"5xx|network"}[5m])) or vector(0)) / sum(rate(tenashop_billpay_requests_seconds_count[5m]))`], { x: 0, y: 31, w: 8, unit: 'percentunit', decimals: 1, thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }, { color: 'red', value: 0.1 }] }, description: 'Alert fires above 10%' }),
  stat('Refunds', [[`sum by (status) (increase(tenashop_refunds_status_total[$__range]))`, '{{status}}', { instant: true }]], { x: 8, y: 31, w: 16, decimals: 0, description: 'Refunds reaching each status in the selected range' }),
], ['payments', 'billpay'])

// ---------- Webhooks & Kafka ----------
id = 0
const webhooks = dashboard('tenashop-webhooks', 'TenaShop · Webhooks & Kafka', 'BillPay webhooks from delivery to processing, and Kafka consumers', [
  row('Selected time range', 0),
  stat('Accepted', [`sum(increase(tenashop_webhooks_received_total{result="accepted"}[$__range]))`], { x: 0, y: 1, decimals: 0, thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }] } }),
  stat('Duplicates', [`sum(increase(tenashop_webhooks_received_total{result="duplicate"}[$__range]))`], { x: 6, y: 1, decimals: 0, description: 'BillPay re-deliveries, acknowledged but not applied again' }),
  stat('Rejected (bad signature)', [`sum(increase(tenashop_webhooks_received_total{result=~"rejected_signature|invalid_json"}[$__range]))`], { x: 12, y: 1, decimals: 0, thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }, { color: 'red', value: 1 }] } }),
  stat('Processing delay p95', [`histogram_quantile(0.95, sum by (le) (rate(tenashop_webhooks_processing_delay_seconds_bucket[$__range])))`], { x: 18, y: 1, unit: 's', decimals: 2, thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }, { color: 'orange', value: 10 }, { color: 'red', value: 30 }] } }),
  row('Webhooks', 5),
  ts('Deliveries by result', [[`sum by (result) (increase(tenashop_webhooks_received_total[5m]))`, '{{result}}']], { x: 0, y: 6, bars: true, stack: true }),
  ts('Processed by outcome', [[`sum by (status) (increase(tenashop_webhooks_processing_delay_seconds_count[5m]))`, '{{status}}']], { x: 12, y: 6, bars: true, stack: true, description: 'PROCESSED applied to an order; DUPLICATE/IGNORED changed nothing' }),
  ts('Received → processed delay', [[`histogram_quantile(0.95, sum by (le) (rate(tenashop_webhooks_processing_delay_seconds_bucket[5m])))`, 'p95'], [`histogram_quantile(0.5, sum by (le) (rate(tenashop_webhooks_processing_delay_seconds_bucket[5m])))`, 'p50']], { x: 0, y: 14, unit: 's', description: 'Stored by the webhook endpoint → applied by the Kafka consumer' }),
  ts('Signature failures', [[`sum(increase(tenashop_webhooks_received_total{result="rejected_signature"}[5m]))`, 'rejected']], { x: 12, y: 14, bars: true }),
  row('Kafka', 22),
  ts('Consumer lag (max per topic)', [[`max by (topic) (kafka_consumer_fetch_manager_records_lag_max{topic=~".+[.].+"})`, '{{topic}}']], { x: 0, y: 23, description: 'Messages waiting to be consumed. Alert above 50 for 5 minutes' }),
  ts('Messages consumed', [[`sum by (topic) (rate(kafka_consumer_fetch_manager_records_consumed_total{topic=~".+[.].+"}[5m]))`, '{{topic}}']], { x: 12, y: 23, unit: 'reqps' }),
  ts('Messages produced', [[`sum by (topic) (rate(kafka_producer_topic_record_send_total{topic=~".+[.].+"}[5m]))`, '{{topic}}']], { x: 0, y: 31, unit: 'reqps' }),
], ['webhooks', 'kafka'])

// ---------- App ----------
id = 0
const notActuator = 'uri!~"/actuator.*"'
const app = dashboard('tenashop-app', 'TenaShop · App', 'Backend HTTP, JVM and database pool', [
  stat('Backend', [`up{job="tenashop-backend"}`], { x: 0, y: 0, w: 4, colorMode: 'background', thresholds: { mode: 'absolute', steps: [{ color: 'red', value: null }, { color: 'green', value: 1 }] }, mappings: [{ type: 'value', options: { 0: { text: 'DOWN' }, 1: { text: 'UP' } } }] }),
  stat('Uptime', [`process_uptime_seconds{job="tenashop-backend"}`], { x: 4, y: 0, w: 5, unit: 's' }),
  stat('Requests / s', [`sum(rate(http_server_requests_seconds_count{${notActuator}}[5m]))`], { x: 9, y: 0, w: 5, unit: 'reqps', decimals: 2 }),
  stat('5xx share (5m)', [`(sum(rate(http_server_requests_seconds_count{status=~"5..",${notActuator}}[5m])) or vector(0)) / sum(rate(http_server_requests_seconds_count{${notActuator}}[5m]))`], { x: 14, y: 0, w: 5, unit: 'percentunit', decimals: 2, thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }, { color: 'red', value: 0.01 }] } }),
  stat('Heap used', [`sum(jvm_memory_used_bytes{area="heap",job="tenashop-backend"}) / sum(jvm_memory_max_bytes{area="heap",job="tenashop-backend"})`], { x: 19, y: 0, w: 5, unit: 'percentunit', decimals: 0, thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }, { color: 'orange', value: 0.8 }] } }),
  ts('HTTP requests by status', [[`sum by (status) (rate(http_server_requests_seconds_count{${notActuator}}[5m]))`, '{{status}}']], { x: 0, y: 4, unit: 'reqps', stack: true }),
  ts('Slowest endpoints (p95)', [[`topk(8, histogram_quantile(0.95, sum by (le, method, uri) (rate(http_server_requests_seconds_bucket{${notActuator}}[5m]))))`, '{{method}} {{uri}}']], { x: 12, y: 4, unit: 's' }),
  ts('JVM heap', [[`sum(jvm_memory_used_bytes{area="heap",job="tenashop-backend"})`, 'used'], [`sum(jvm_memory_committed_bytes{area="heap",job="tenashop-backend"})`, 'committed']], { x: 0, y: 12, unit: 'bytes' }),
  ts('CPU', [[`process_cpu_usage{job="tenashop-backend"}`, 'backend process'], [`system_cpu_usage{job="tenashop-backend"}`, 'machine']], { x: 12, y: 12, unit: 'percentunit' }),
  ts('Database pool', [[`hikaricp_connections_active`, 'active'], [`hikaricp_connections_idle`, 'idle'], [`hikaricp_connections_pending`, 'waiting']], { x: 0, y: 20 }),
  ts('JVM threads and GC pauses', [[`jvm_threads_live_threads{job="tenashop-backend"}`, 'live threads'], [`sum(rate(jvm_gc_pause_seconds_sum[5m])) * 1000`, 'GC ms per s']], { x: 12, y: 20 }),
], ['app'])

for (const [file, d] of [['payments.json', payments], ['webhooks-kafka.json', webhooks], ['app.json', app]]) {
  fs.writeFileSync(path.join(OUT, file), JSON.stringify(d, null, 2) + '\n')
  console.log('wrote', file, d.panels.length, 'panels')
}
