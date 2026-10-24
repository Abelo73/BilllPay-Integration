// Generates the Grafana "Load tests" dashboard (monitoring/grafana/dashboards/load-tests.json).
// k6 sends its numbers to Prometheus (k6_* metrics, label testid = the run id shown in Admin → Load tests);
// the test shop's own metrics are scraped with a perf_ prefix (monitoring/prometheus/prometheus.yml, job tenashop-perf).
// k6 sends times in seconds (e.g. k6_http_req_duration_p95 = 0.25 means 250 ms).
// Run: node perf/make-dashboard.mjs
import fs from 'node:fs'
import path from 'node:path'

const OUT = path.join(import.meta.dirname, '..', 'monitoring', 'grafana', 'dashboards', 'load-tests.json')
const DS = { type: 'prometheus', uid: 'prometheus' }
let id = 0
const T = '{testid=~"$testid"}'
const t = (expr, legend, i = 0, extra = {}) => ({ datasource: DS, expr, legendFormat: legend, refId: String.fromCharCode(65 + i), ...extra })

function stat(title, expr, { x, y, w = 4, h = 4, unit = 'short', decimals, thresholds, description }) {
  return {
    id: ++id, type: 'stat', title, description, datasource: DS, gridPos: { x, y, w, h },
    targets: [t(expr, '', 0, { instant: false })],
    fieldConfig: { defaults: { unit, decimals, color: { mode: 'thresholds' }, thresholds: thresholds ?? { mode: 'absolute', steps: [{ color: 'blue', value: null }] } }, overrides: [] },
    options: { reduceOptions: { calcs: ['max'], fields: '', values: false }, colorMode: 'value', graphMode: 'area', textMode: 'auto' },
  }
}

function ts(title, exprs, { x, y, w = 12, h = 8, unit = 'short', description, stack = false }) {
  return {
    id: ++id, type: 'timeseries', title, description, datasource: DS, gridPos: { x, y, w, h },
    targets: exprs.map(([e, l], i) => t(e, l, i)),
    fieldConfig: { defaults: { unit, color: { mode: 'palette-classic' }, custom: { lineWidth: 2, fillOpacity: 10, showPoints: 'never', spanNulls: true, axisSoftMin: 0, stacking: { mode: stack ? 'normal' : 'none' } } }, overrides: [] },
    options: { legend: { displayMode: 'list', placement: 'bottom', showLegend: true }, tooltip: { mode: 'multi', sort: 'desc' } },
  }
}
const row = (title, y) => ({ id: ++id, type: 'row', title, collapsed: false, gridPos: { x: 0, y, w: 24, h: 1 }, panels: [] })

const dashboard = {
  uid: 'tenashop-load-tests', title: 'TenaShop · Load tests',
  description: 'k6 load tests (Admin → Load tests) and how the test copy of the shop held up. Pick a run in "Run".',
  tags: ['tenashop', 'load-tests'], editable: false, schemaVersion: 39, version: 1,
  time: { from: 'now-30m', to: 'now' }, refresh: '5s', timezone: 'browser', graphTooltip: 1,
  templating: {
    list: [{
      name: 'testid', label: 'Run', type: 'query', datasource: DS, query: { query: 'label_values(k6_vus, testid)', refId: 'q' },
      refresh: 2, includeAll: true, multi: false, allValue: '.*', current: { text: 'All', value: '$__all' }, sort: 2,
    }],
  },
  annotations: { list: [] },
  links: [{ title: 'App', type: 'link', url: '/d/tenashop-app', icon: 'dashboard' }],
  panels: [
    row('What the shoppers saw (k6)', 0),
    stat('Users', `max(k6_vus${T})`, { x: 0, y: 1 }),
    stat('Requests / s', `sum(rate(k6_http_reqs_total${T}[30s]))`, { x: 4, y: 1, unit: 'reqps', decimals: 1 }),
    stat('95% respond within', `max(k6_http_req_duration_p95${T})`, { x: 8, y: 1, unit: 's', decimals: 2, thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }, { color: 'orange', value: 0.3 }, { color: 'red', value: 1 }] } }),
    stat('Errors', `avg(k6_http_req_failed_rate${T})`, { x: 12, y: 1, unit: 'percentunit', decimals: 2, thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }, { color: 'red', value: 0.01 }] } }),
    stat('Checks passed', `avg(k6_checks_rate${T})`, { x: 16, y: 1, unit: 'percentunit', decimals: 1, thresholds: { mode: 'absolute', steps: [{ color: 'red', value: null }, { color: 'green', value: 0.99 }] } }),
    stat('Orders paid', `sum(k6_checkouts_paid_total${T})`, { x: 20, y: 1, decimals: 0 }),
    ts('Users and requests / s', [[`max(k6_vus${T})`, 'users'], [`sum(rate(k6_http_reqs_total${T}[30s]))`, 'requests/s']], { x: 0, y: 5 }),
    ts('95% response time by request', [[`max by (name) (k6_http_req_duration_p95${T})`, '{{name}}']], { x: 12, y: 5, unit: 's' }),
    ts('Errors and failed checks', [[`avg(k6_http_req_failed_rate${T})`, 'failed requests'], [`1 - avg(k6_checks_rate${T})`, 'failed checks']], { x: 0, y: 13, unit: 'percentunit' }),
    ts('Checkout → paid (95%)', [[`max(k6_time_to_paid_p95${T})`, 'time to paid'], [`sum(rate(k6_checkouts_paid_total${T}[30s]))`, 'orders paid / s']], { x: 12, y: 13, unit: 's', description: 'k6 sends times in seconds' }),
    row('How the test shop held up (perf-backend, 2 CPUs / 1 GB)', 21),
    ts('CPU', [['perf_process_cpu_usage', 'shop process'], ['perf_system_cpu_usage', 'machine']], { x: 0, y: 22, w: 8, unit: 'percentunit' }),
    ts('Heap', [['sum(perf_jvm_memory_used_bytes{area="heap"})', 'used'], ['sum(perf_jvm_memory_max_bytes{area="heap"})', 'max']], { x: 8, y: 22, w: 8, unit: 'bytes' }),
    ts('Database pool', [['perf_hikaricp_connections_active', 'in use'], ['perf_hikaricp_connections_pending', 'waiting'], ['perf_hikaricp_connections_max', 'max']], { x: 16, y: 22, w: 8, description: '"waiting" above 0 means requests queue for a database connection' }),
    ts('Slowest endpoints (95%)', [['topk(6, histogram_quantile(0.95, sum by (le, method, uri) (rate(perf_http_server_requests_seconds_bucket{uri!~"/actuator.*"}[30s]))))', '{{method}} {{uri}}']], { x: 0, y: 30, unit: 's' }),
    ts('Webhook received → applied (95%) and Kafka lag', [['histogram_quantile(0.95, sum by (le) (rate(perf_tenashop_webhooks_processing_delay_seconds_bucket[30s])))', 'webhook → applied'], ['max(perf_kafka_consumer_fetch_manager_records_lag_max{topic=~".+[.].+"})', 'Kafka lag (messages)']], { x: 12, y: 30 }),
    ts('BillPay (fake) call time (95%)', [['histogram_quantile(0.95, sum by (le, operation) (rate(perf_tenashop_billpay_requests_seconds_bucket[30s])))', '{{operation}}']], { x: 0, y: 38, unit: 's' }),
    ts('Answers by status', [['sum by (status) (rate(perf_http_server_requests_seconds_count{uri!~"/actuator.*"}[30s]))', '{{status}}']], { x: 12, y: 38, unit: 'reqps', stack: true }),
  ],
}

fs.writeFileSync(OUT, JSON.stringify(dashboard, null, 2) + '\n')
console.log('wrote', OUT, dashboard.panels.length, 'panels')
