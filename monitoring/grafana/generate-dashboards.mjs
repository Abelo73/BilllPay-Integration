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

// Markers on every dashboard: backend restarts and alerts that fired (toggle them at the top of the dashboard)
const annotations = [
  { builtIn: 1, name: 'Annotations & Alerts', type: 'dashboard', datasource: { type: 'grafana', uid: '-- Grafana --' }, enable: true, hide: true, iconColor: 'rgba(0, 211, 255, 1)' },
  { name: 'Backend restarts', datasource: DS, enable: true, iconColor: 'orange', step: '60s', titleFormat: 'Backend restarted', textFormat: '', tagKeys: '', useValueForTime: false,
    expr: '(time() - process_start_time_seconds{job="tenashop-backend"}) < 90' },
  { name: 'Alerts firing', datasource: DS, enable: true, iconColor: 'red', step: '60s', titleFormat: '{{alertname}}', textFormat: '{{severity}} {{name}}{{reason}}', tagKeys: 'severity', useValueForTime: false,
    expr: 'ALERTS{alertstate="firing"}' },
]

const NAV = [
  ['Business', '/d/tenashop-business'], ['Payments', '/d/tenashop-payments'], ['Webhooks & Kafka', '/d/tenashop-webhooks'],
  ['App', '/d/tenashop-app'], ['Uptime & Alerts', '/d/tenashop-uptime'],
]

function dashboard(uid, title, description, panels, tags, { variables = [], links = [], time = 'now-6h', refresh = '30s' } = {}) {
  return {
    uid, title, description, tags: ['tenashop', ...tags], editable: false, schemaVersion: 39, version: 1,
    time: { from: time, to: 'now' }, refresh, timezone: 'browser', graphTooltip: 1,
    templating: { list: variables }, annotations: { list: annotations },
    links: [...NAV.map(([t, url]) => ({ title: t, type: 'link', url, icon: 'dashboard' })), ...links],
    panels,
  }
}

// ---------- Postgres (TenaShop DB) helpers ----------
const PG = { type: 'grafana-postgresql-datasource', uid: 'tenashop-db' }
const sql = (rawSql, format = 'table', refId = 'A') => ({ datasource: PG, rawSql, format, rawQuery: true, editorMode: 'code', refId })
const onPg = (panel, queries, format) => ({ ...panel, datasource: PG, targets: queries.map((q, i) => sql(q, format, String.fromCharCode(65 + i))) })
const pgStat = (title, query, opts) => onPg(stat(title, [], opts), [query], 'table')
const pgTs = (title, query, opts) => onPg(ts(title, [], opts), [query], 'time_series')
function pgBars(title, query, { x, y, w = 12, h = 8, unit = 'short', description } = {}) {
  const p = onPg(barGauge(title, '', '', { x, y, w, h, unit, description }), [query], 'table')
  p.options.reduceOptions = { calcs: ['lastNotNull'], fields: '', values: true }
  return p
}
function pie(title, query, { x, y, w = 8, h = 8, description } = {}) {
  return onPg({
    id: ++id, type: 'piechart', title, description, gridPos: { x, y, w, h },
    fieldConfig: { defaults: { color: { mode: 'palette-classic' } }, overrides: [] },
    options: { pieType: 'donut', reduceOptions: { calcs: ['lastNotNull'], fields: '', values: true }, legend: { displayMode: 'table', placement: 'right', values: ['value', 'percent'], showLegend: true }, tooltip: { mode: 'single' } },
  }, [query], 'table')
}
function table(title, targetsOrSql, { x, y, w = 12, h = 8, description, overrides = [], transformations = [], pg = true } = {}) {
  const panel = {
    id: ++id, type: 'table', title, description, gridPos: { x, y, w, h }, transformations,
    fieldConfig: { defaults: { custom: { align: 'auto', cellOptions: { type: 'auto' } } }, overrides },
    options: { showHeader: true, cellHeight: 'sm', footer: { show: false, reducer: ['sum'], fields: '' } },
  }
  return pg ? onPg(panel, [targetsOrSql], 'table') : { ...panel, datasource: DS, targets: targetsOrSql }
}
const unitFor = (name, unit, extra = {}) => ({ matcher: { id: 'byName', options: name }, properties: [{ id: 'unit', value: unit }, ...Object.entries(extra).map(([k, v]) => ({ id: k, value: v }))] })

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

// ---------- Business (SQL on the shop database) ----------
// Numbers here come from the database, so they survive backend restarts (unlike Prometheus counters).
// $env is a SQL condition picked from the "BillPay" dropdown; every query names the orders table `o`.
id = 0
const PAID = `o.status IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')`
const ETB = 'suffix: ETB'
const green = { mode: 'absolute', steps: [{ color: 'green', value: null }] }
const businessVars = [
  {
    type: 'custom', name: 'env', label: 'BillPay', hide: 0, skipUrlSync: false,
    query: `All : true,Sandbox : o.environment = 'SANDBOX',Live : o.environment = 'LIVE'`,
    current: { text: 'All', value: 'true', selected: true },
    options: [
      { text: 'All', value: 'true', selected: true },
      { text: 'Sandbox', value: `o.environment = 'SANDBOX'`, selected: false },
      { text: 'Live', value: `o.environment = 'LIVE'`, selected: false },
    ],
    description: 'Sandbox = test money, Live = real money',
  },
  {
    type: 'custom', name: 'bucket', label: 'Group by', hide: 0, skipUrlSync: false, query: '1h,1d,1w',
    current: { text: '1d', value: '1d', selected: true },
    options: ['1h', '1d', '1w'].map((v) => ({ text: v, value: v, selected: v === '1d' })),
  },
]
const business = dashboard('tenashop-business', 'TenaShop · Business', 'Revenue, orders, products, delivery and stock, straight from the shop database', [
  row('Selected time range', 0),
  pgStat('Revenue', `SELECT coalesce(sum(o.total), 0) AS "Revenue" FROM orders o WHERE $env AND ${PAID} AND $__timeFilter(o.paid_at)`,
    { x: 0, y: 1, w: 4, unit: ETB, decimals: 0, thresholds: green, description: 'Totals of orders paid in the range (incl. delivery fee, after discounts)' }),
  pgStat('Paid orders', `SELECT count(*) AS "Paid orders" FROM orders o WHERE $env AND ${PAID} AND $__timeFilter(o.paid_at)`,
    { x: 4, y: 1, w: 4, decimals: 0, thresholds: green }),
  pgStat('Average order', `SELECT avg(o.total) AS "Average order" FROM orders o WHERE $env AND ${PAID} AND $__timeFilter(o.paid_at)`,
    { x: 8, y: 1, w: 4, unit: ETB, decimals: 2 }),
  pgStat('Checkout conversion', `SELECT (count(*) FILTER (WHERE ${PAID}))::float / nullif(count(*), 0) AS "Paid ÷ placed" FROM orders o WHERE $env AND $__timeFilter(o.created_at)`,
    { x: 12, y: 1, w: 4, unit: 'percentunit', decimals: 1, thresholds: pct, description: 'Orders placed in the range that ended up paid' }),
  pgStat('Refunded', `SELECT coalesce(sum(r.amount), 0) AS "Refunded" FROM refunds r JOIN orders o ON o.id = r.order_id WHERE $env AND r.status = 'SUCCEEDED' AND $__timeFilter(r.created_at)`,
    { x: 16, y: 1, w: 4, unit: ETB, decimals: 0 }),
  pgStat('Discounts given', `SELECT coalesce(sum(o.discount_amount), 0) AS "Discounts" FROM orders o WHERE $env AND ${PAID} AND $__timeFilter(o.paid_at)`,
    { x: 20, y: 1, w: 4, unit: ETB, decimals: 0 }),

  row('Over time', 5),
  pgTs('Revenue', `SELECT $__timeGroupAlias(o.paid_at, $bucket), sum(o.total) AS "Revenue" FROM orders o WHERE $env AND ${PAID} AND $__timeFilter(o.paid_at) GROUP BY 1 ORDER BY 1`,
    { x: 0, y: 6, unit: ETB, bars: true, description: 'Grouped by the "Group by" dropdown (UTC buckets)' }),
  pgTs('Orders placed, by outcome', `SELECT $__timeGroupAlias(o.created_at, $bucket), o.status AS metric, count(*) AS value FROM orders o WHERE $env AND $__timeFilter(o.created_at) GROUP BY 1, 2 ORDER BY 1`,
    { x: 12, y: 6, bars: true, stack: true, description: 'Where each order placed in that bucket is now: PAID, EXPIRED, CANCELLED, ...' }),

  row('Products and payments', 14),
  table('Top products', `SELECT i.product_name AS "Product", sum(i.quantity) AS "Units", sum(i.line_total) AS "Revenue" FROM order_items i JOIN orders o ON o.id = i.order_id WHERE $env AND ${PAID} AND $__timeFilter(o.paid_at) GROUP BY 1 ORDER BY 3 DESC LIMIT 10`,
    { x: 0, y: 15, w: 10, h: 9, overrides: [unitFor('Revenue', ETB, { decimals: 0 })] }),
  pie('Paid by method', `SELECT coalesce(p.payment_method, 'unknown') AS "Method", count(*) AS "Paid" FROM payment_attempts p JOIN orders o ON o.id = p.order_id WHERE $env AND p.status = 'SUCCEEDED' AND $__timeFilter(p.updated_at) GROUP BY 1 ORDER BY 2 DESC`,
    { x: 10, y: 15, w: 7, h: 9 }),
  pgBars('Why payments did not go through', `SELECT coalesce(p.reason_code, p.status) AS "Reason", count(*) AS "Payments" FROM payment_attempts p JOIN orders o ON o.id = p.order_id WHERE $env AND p.status IN ('FAILED', 'EXPIRED', 'CANCELLED', 'ERROR') AND $__timeFilter(p.updated_at) GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
    { x: 17, y: 15, w: 7, h: 9, description: "BillPay's reason code, or the status when there is none (EXPIRED = never paid)" }),

  row('Delivery and stock', 24),
  pgStat('To fulfil now', `SELECT count(*) AS "To fulfil" FROM orders o WHERE $env AND o.status = 'PAID' AND coalesce(o.fulfilment_status, 'UNFULFILLED') IN ('UNFULFILLED', 'PROCESSING')`,
    { x: 0, y: 25, w: 6, decimals: 0, thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }, { color: 'orange', value: 5 }] }, description: 'Paid orders not shipped yet (right now, ignores the time range)' }),
  pgStat('Oldest waiting', `SELECT extract(epoch FROM now() - min(o.paid_at)) AS "Oldest" FROM orders o WHERE $env AND o.status = 'PAID' AND coalesce(o.fulfilment_status, 'UNFULFILLED') IN ('UNFULFILLED', 'PROCESSING')`,
    { x: 6, y: 25, w: 6, unit: 's', decimals: 1, thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }, { color: 'orange', value: 86400 }, { color: 'red', value: 172800 }] }, description: 'Time since the oldest unshipped paid order was paid' }),
  pgStat('On the way', `SELECT count(*) AS "Shipped" FROM orders o WHERE $env AND o.fulfilment_status = 'SHIPPED'`,
    { x: 12, y: 25, w: 6, decimals: 0 }),
  pgStat('Paid → delivered (avg)', `SELECT avg(extract(epoch FROM o.delivered_at - o.paid_at)) AS "Paid to delivered" FROM orders o WHERE $env AND o.delivered_at IS NOT NULL AND $__timeFilter(o.delivered_at)`,
    { x: 18, y: 25, w: 6, unit: 's', decimals: 1 }),
  table('Low stock', `SELECT p.name AS "Product", p.stock - p.reserved AS "Available", p.reserved AS "Held for checkouts", p.low_stock_threshold AS "Alert at" FROM products p WHERE p.active AND p.stock - p.reserved <= p.low_stock_threshold ORDER BY 2, 1`,
    { x: 0, y: 29, w: 10, h: 9, description: 'Active products at or below their low-stock alert level',
      overrides: [{ matcher: { id: 'byName', options: 'Available' }, properties: [{ id: 'custom.cellOptions', value: { type: 'color-text' } }, { id: 'thresholds', value: { mode: 'absolute', steps: [{ color: 'red', value: null }, { color: 'orange', value: 1 }] } }] }] }),
  table('Latest orders', `SELECT o.created_at AS "Placed", o.order_number AS "Order", o.status AS "Status", o.fulfilment_status AS "Delivery", o.total AS "Total" FROM orders o WHERE $env AND $__timeFilter(o.created_at) ORDER BY o.created_at DESC LIMIT 20`,
    { x: 10, y: 29, w: 14, h: 9, description: 'Click an order number to open it in the admin',
      overrides: [unitFor('Total', ETB, { decimals: 2 }), { matcher: { id: 'byName', options: 'Order' }, properties: [{ id: 'links', value: [{ title: 'Open in admin', url: 'http://localhost:5280/admin/orders/${__value.raw}', targetBlank: true }] }] }] }),

  row('Operations', 38),
  pgBars('Customer emails', `SELECT n.status AS "Status", count(*) AS "Emails" FROM notifications n WHERE $__timeFilter(n.created_at) GROUP BY 1 ORDER BY 2 DESC`,
    { x: 0, y: 39, w: 6, h: 7, description: 'FAILED means the email could not be sent (SMTP down?)' }),
  pgBars('Webhooks stored', `SELECT w.status AS "Status", count(*) AS "Webhooks" FROM billpay_webhook_events w WHERE $__timeFilter(w.received_at) GROUP BY 1 ORDER BY 2 DESC`,
    { x: 6, y: 39, w: 6, h: 7 }),
  pgTs('Failed sign-ins', `SELECT $__timeGroupAlias(l.created_at, $bucket), l.portal || ' · ' || l.reason AS metric, count(*) AS value FROM login_events l WHERE NOT l.success AND $__timeFilter(l.created_at) GROUP BY 1, 2 ORDER BY 1`,
    { x: 12, y: 39, w: 12, h: 7, bars: true, stack: true, description: 'Wrong passwords, locked or disabled accounts, by portal. A sudden spike can mean password guessing.' }),
  table('Discount codes', `SELECT d.code AS "Code", d.kind AS "Type", d.value AS "Value", d.times_used AS "Used", d.usage_limit AS "Limit", d.active AS "Active", d.expires_at AS "Expires" FROM discount_codes d ORDER BY d.times_used DESC, d.code LIMIT 15`,
    { x: 0, y: 46, w: 24, h: 7 }),

  // Checkout recovery: where unpaid orders drop off, and how many come back after a reminder or a failed try
  row('Checkout recovery', 53),
  pgBars('Checkout funnel', `SELECT step AS "Step", n AS "Orders" FROM (
  SELECT 1 AS k, '1 · Placed' AS step, count(*) AS n FROM orders o WHERE $env AND $__timeFilter(o.created_at)
  UNION ALL SELECT 2, '2 · BillPay link created', count(*) FROM orders o WHERE $env AND $__timeFilter(o.created_at)
    AND EXISTS (SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.type = 'PAYMENT_REQUESTED')
  UNION ALL SELECT 3, '3 · Tried to pay', count(*) FROM orders o WHERE $env AND $__timeFilter(o.created_at)
    AND EXISTS (SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.type IN ('PAYMENT_TRY_FAILED', 'PAYMENT_FAILED', 'PAID'))
  UNION ALL SELECT 4, '4 · Paid', count(*) FROM orders o WHERE $env AND $__timeFilter(o.created_at) AND ${PAID}
) f ORDER BY k`,
    { x: 0, y: 54, w: 12, h: 8, description: 'Orders placed in the range and how far they got. "Tried to pay" = BillPay reported a try (paid or declined).' }),
  pgStat('Reminders sent', `SELECT count(*) AS "Reminders" FROM order_events e JOIN orders o ON o.id = e.order_id WHERE $env AND e.type = 'PAYMENT_REMINDER' AND $__timeFilter(e.created_at)`,
    { x: 12, y: 54, w: 6, decimals: 0, description: 'One "finish paying" email per unpaid order, 10 minutes before it expires (PAYMENT_REMINDER_BEFORE)' }),
  pgStat('Paid after the reminder', `SELECT (count(*) FILTER (WHERE ${PAID}))::float / nullif(count(*), 0) AS "Recovered" FROM orders o WHERE $env AND EXISTS (SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.type = 'PAYMENT_REMINDER' AND $__timeFilter(e.created_at))`,
    { x: 18, y: 54, w: 6, unit: 'percentunit', decimals: 0, thresholds: { mode: 'absolute', steps: [{ color: 'text', value: null }, { color: 'green', value: 0.1 }] }, description: 'Reminded orders that ended up paid' }),
  pgStat('Recovered after a failed try', `SELECT count(*) AS "Recovered" FROM orders o WHERE $env AND ${PAID} AND $__timeFilter(o.paid_at) AND EXISTS (SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.type IN ('PAYMENT_TRY_FAILED', 'PAYMENT_FAILED'))`,
    { x: 12, y: 58, w: 6, decimals: 0, thresholds: green, description: 'Paid orders whose first try was declined: the "try again" flow working' }),
  pgStat('Revenue recovered', `SELECT coalesce(sum(o.total), 0) AS "Recovered" FROM orders o WHERE $env AND ${PAID} AND $__timeFilter(o.paid_at) AND EXISTS (SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.type IN ('PAYMENT_REMINDER', 'PAYMENT_TRY_FAILED', 'PAYMENT_FAILED'))`,
    { x: 18, y: 58, w: 6, unit: ETB, decimals: 0, thresholds: green, description: 'Paid orders that were reminded or had a declined try first' }),
], ['business', 'sql'], { variables: businessVars, time: 'now-7d', refresh: '1m' })

// ---------- Uptime & Alerts (blackbox probes + Prometheus alerts) ----------
id = 0
const updown = [{ type: 'value', options: { 0: { text: 'DOWN', color: 'red' }, 1: { text: 'UP', color: 'green' } } }]
const upThresholds = { mode: 'absolute', steps: [{ color: 'red', value: null }, { color: 'green', value: 1 }] }
const uptime = dashboard('tenashop-uptime', 'TenaShop · Uptime & Alerts', 'Is everything reachable from the outside, and which alerts are firing', [
  row('Alerts', 0),
  stat('Firing alerts', [`count(ALERTS{alertstate="firing"}) or vector(0)`], { x: 0, y: 1, w: 6, decimals: 0, colorMode: 'background', thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }, { color: 'red', value: 1 }] }, description: 'Emailed by Alertmanager (Mailpit in dev)' }),
  stat('Pending alerts', [`count(ALERTS{alertstate="pending"}) or vector(0)`], { x: 6, y: 1, w: 6, decimals: 0, colorMode: 'background', thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }, { color: 'orange', value: 1 }] }, description: 'Condition is true but has not lasted long enough to fire yet' }),
  stat('Endpoints down', [`count(probe_success{job="probes"} == 0) or vector(0)`], { x: 12, y: 1, w: 6, decimals: 0, colorMode: 'background', thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }, { color: 'red', value: 1 }] } }),
  stat('Alertmanager', [`up{job="alertmanager"}`], { x: 18, y: 1, w: 6, colorMode: 'background', thresholds: upThresholds, mappings: updown, description: 'If this is DOWN, alerts are not emailed' }),
  table('Active alerts', [target(`ALERTS{alertstate=~"firing|pending"}`, '', 'A', { instant: true, format: 'table' })],
    { x: 0, y: 5, w: 24, h: 7, pg: false, description: 'Silence an alert in Grafana → Alerting → Silences (source: Alertmanager) or at http://localhost:9393',
      transformations: [{ id: 'organize', options: { excludeByName: { Time: true, Value: true, __name__: true, job: true, service: true, module: true }, renameByName: { alertname: 'Alert', alertstate: 'State', severity: 'Severity', name: 'Endpoint' } } }] }),

  row('Endpoints (checked every 30 s from the outside)', 12),
  stat('Now', [[`probe_success{job="probes"}`, '{{name}}', { instant: true }]], { x: 0, y: 13, w: 24, h: 4, colorMode: 'background', thresholds: upThresholds, mappings: updown }),
  {
    id: ++id, type: 'state-timeline', title: 'Up / down over time', datasource: DS, gridPos: { x: 0, y: 17, w: 24, h: 7 },
    targets: [target(`probe_success{job="probes"}`, '{{name}}')],
    fieldConfig: { defaults: { color: { mode: 'thresholds' }, thresholds: upThresholds, mappings: updown, custom: { fillOpacity: 80, lineWidth: 0 } }, overrides: [] },
    options: { showValue: 'never', mergeValues: true, alignValue: 'left', rowHeight: 0.8, legend: { showLegend: false } },
  },
  stat('Availability (selected range)', [[`avg_over_time(probe_success{job="probes"}[$__range])`, '{{name}}', { instant: true }]],
    { x: 0, y: 24, w: 24, h: 4, unit: 'percentunit', decimals: 2, thresholds: { mode: 'absolute', steps: [{ color: 'red', value: null }, { color: 'orange', value: 0.95 }, { color: 'green', value: 0.99 }] } }),
  ts('Response time', [[`probe_duration_seconds{job="probes"}`, '{{name}}']], { x: 0, y: 28, unit: 's', description: 'Full check time, including DNS, TLS and the tunnel' }),
  stat('TLS certificate expires in', [[`probe_ssl_earliest_cert_expiry{job="probes"} - time()`, '{{name}}', { instant: true }]],
    { x: 12, y: 28, h: 8, unit: 's', decimals: 0, thresholds: { mode: 'absolute', steps: [{ color: 'red', value: null }, { color: 'orange', value: 604800 }, { color: 'green', value: 1209600 }] }, description: 'Alert below 14 days' }),
], ['uptime', 'alerts'], { links: [
  { title: 'Alertmanager', type: 'link', url: 'http://localhost:9393', icon: 'bolt', targetBlank: true },
  { title: 'Alert emails (Mailpit)', type: 'link', url: 'http://localhost:8626', icon: 'info', targetBlank: true },
] })

for (const [file, d] of [['business.json', business], ['payments.json', payments], ['webhooks-kafka.json', webhooks], ['app.json', app], ['uptime.json', uptime]]) {
  fs.writeFileSync(path.join(OUT, file), JSON.stringify(d, null, 2) + '\n')
  console.log('wrote', file, d.panels.length, 'panels')
}
