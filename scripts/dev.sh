#!/usr/bin/env bash
# TenaShop dev stack: restart the backend, start what isn't running, then check everything.
#
#   scripts/dev.sh            restart the backend so it runs your latest code (even one started in another
#                             terminal), start anything else that is down, then run all checks (default)
#   scripts/dev.sh restart    same as the default
#   scripts/dev.sh up         start only what is down; a running backend is left alone (faster, keeps old code)
#   scripts/dev.sh check      only run the checks
#   scripts/dev.sh test       checks + a quick end-to-end smoke test (catalog, sign-up, sign-in, admin)
#   scripts/dev.sh logs [backend|frontend|ngrok]   follow a log
#   scripts/dev.sh stop       stop backend, frontend and ngrok started by this script
#   scripts/dev.sh stop-all   same, plus stop the Docker containers (data is kept)
#   scripts/dev.sh perf       start the load-test environment (Admin → Load tests); perf-down stops it
#
# Run inside WSL (Docker, ngrok and Java 21 live there). From PowerShell use scripts\dev.ps1.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN="$ROOT/.run"
mkdir -p "$RUN"

# Node/pnpm come from nvm in interactive shells; load it here so we don't pick up Windows' pnpm from PATH.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1

# ---------- output helpers ----------
if [ -t 1 ]; then G=$'\e[32m'; R=$'\e[31m'; Y=$'\e[33m'; B=$'\e[1m'; D=$'\e[2m'; N=$'\e[0m'; else G= R= Y= B= D= N=; fi
FAILS=0
ok()   { printf "  ${G}✔${N} %-28s %s\n" "$1" "${2:-}"; }
bad()  { printf "  ${R}✘${N} %-28s %s\n" "$1" "${2:-}"; FAILS=$((FAILS + 1)); }
warn() { printf "  ${Y}!${N} %-28s %s\n" "$1" "${2:-}"; }
step() { printf "\n${B}%s${N}\n" "$1"; }
fix()  { printf "      ${D}→ %s${N}\n" "$1"; }

# ---------- config from .env ----------
ENV_FILE="$ROOT/.env"
envget() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '\r'; }
BACKEND_PORT=$(envget BACKEND_PORT); BACKEND_PORT=${BACKEND_PORT:-8181}
FRONTEND_PORT=$(envget FRONTEND_PORT); FRONTEND_PORT=${FRONTEND_PORT:-5280}
KAFKA_UI_PORT=$(envget KAFKA_UI_PORT); KAFKA_UI_PORT=${KAFKA_UI_PORT:-8191}
PROMETHEUS_PORT=$(envget PROMETHEUS_PORT); PROMETHEUS_PORT=${PROMETHEUS_PORT:-9390}
GRAFANA_PORT=$(envget GRAFANA_PORT); GRAFANA_PORT=${GRAFANA_PORT:-8484}
ALERTMANAGER_PORT=$(envget ALERTMANAGER_PORT); ALERTMANAGER_PORT=${ALERTMANAGER_PORT:-9393}
MAILPIT_UI_PORT=$(envget MAILPIT_UI_PORT); MAILPIT_UI_PORT=${MAILPIT_UI_PORT:-8626}
PUBLIC_URL=$(envget APP_REDIRECT_BASE_URL); PUBLIC_URL=${PUBLIC_URL%/}
NGROK_DOMAIN=${PUBLIC_URL#https://}

http_code() { curl -s -o /dev/null -m "${2:-5}" -w '%{http_code}' -H 'ngrok-skip-browser-warning: 1' "$1" 2>/dev/null; }
backend_up()  { [ "$(http_code "http://localhost:$BACKEND_PORT/actuator/health")" = 200 ]; }
frontend_up() { [ "$(http_code "http://localhost:$FRONTEND_PORT/" 15)" = 200 ]; }  # first hit compiles the page
public_up()   { [ -n "$NGROK_DOMAIN" ] && [ "$(http_code "$PUBLIC_URL/actuator/health" 10)" = 200 ]; }

# Java 21 for the backend (WSL's default java may be older)
use_java21() {
  local cand
  for cand in "${JAVA_HOME:-}" "$HOME/.local/java/current" "$HOME/.sdkman/candidates/java/current" /usr/lib/jvm/*21*; do
    [ -n "$cand" ] && [ -x "$cand/bin/java" ] || continue
    if "$cand/bin/java" -version 2>&1 | grep -qE 'version "2[1-9]'; then
      export JAVA_HOME="$cand" PATH="$cand/bin:$PATH"; return 0
    fi
  done
  return 1
}

# Starts a command in the background, remembering its PID so `stop` only touches what we started.
launch() { # name dir command...
  local name=$1 dir=$2; shift 2
  # The inner shell records its own PID, then execs the command as leader of a new session,
  # so `stop` can end the whole process group (mvnw → java, node → esbuild, ...).
  # All fds are detached so no leftover shell keeps the caller's output pipe open (e.g. `dev.sh | tee`).
  (
    cd "$dir" || exit 1
    nohup setsid bash -c 'echo $$ > "$0"; exec "$@"' "$RUN/$name.pid" "$@" > "$RUN/$name.log" 2>&1 < /dev/null &
  ) > /dev/null 2>&1 < /dev/null
  sleep 1
}

wait_for() { # description seconds check-function log
  local desc=$1 secs=$2 fn=$3 log=${4:-} i
  printf "  … waiting for %s" "$desc"
  for ((i = 0; i < secs; i += 3)); do
    if $fn; then printf "\r\033[K"; return 0; fi
    if [ -n "$log" ] && grep -qE 'APPLICATION FAILED|Application run failed|ERR_NGROK|Error:' "$log" 2>/dev/null; then break; fi
    sleep 3; printf "."
  done
  printf "\r\033[K"; return 1
}

# ---------- prerequisites ----------
prereqs() {
  step "Prerequisites"
  [ -f "$ENV_FILE" ] && ok ".env" || { bad ".env" "missing"; fix "cp .env.example .env and fill in BILLPAY_API_KEY"; }
  command -v docker >/dev/null && docker info >/dev/null 2>&1 && ok "Docker" "$(docker version --format '{{.Server.Version}}' 2>/dev/null)" \
    || { bad "Docker" "not running"; fix "start Docker in WSL: sudo service docker start"; }
  use_java21 && ok "Java 21" "$JAVA_HOME" || { bad "Java 21" "not found"; fix "install JDK 21 or set JAVA_HOME"; }
  if command -v node >/dev/null && command -v pnpm >/dev/null && [[ "$(command -v pnpm)" != /mnt/* ]]; then
    ok "Node + pnpm" "node $(node -v), pnpm $(pnpm -v)"
  else
    bad "Node + pnpm" "no Linux node/pnpm found"; fix "install Node in WSL (nvm install 24) and run: corepack enable"
  fi
  command -v ngrok >/dev/null && ok "ngrok" "$(ngrok version 2>/dev/null | awk '{print $3}')" || warn "ngrok" "not installed (webhooks won't reach you)"
  [ -n "$NGROK_DOMAIN" ] || warn "APP_REDIRECT_BASE_URL" "not set in .env (BillPay needs an https return URL)"
}

# ---------- start ----------
start_infra() {
  step "Docker: Postgres, Kafka, Kafka UI, media (photos), Mailpit (email), Prometheus, Alertmanager, probes, Grafana"
  (cd "$ROOT" && docker compose up -d postgres kafka kafka-ui media mailpit prometheus alertmanager blackbox grafana-db-init grafana >/dev/null 2>"$RUN/docker.log") \
    || { bad "docker compose up" "see .run/docker.log"; return; }
  local i; for i in $(seq 1 40); do
    [ "$(docker inspect -f '{{.State.Health.Status}}' tenashop-postgres-1 2>/dev/null)" = healthy ] &&
    [ "$(docker inspect -f '{{.State.Health.Status}}' tenashop-kafka-1 2>/dev/null)" = healthy ] &&
    [ "$(docker inspect -f '{{.State.Health.Status}}' tenashop-media-1 2>/dev/null)" = healthy ] && break
    sleep 3
  done
  ok "containers started"
}

start_backend() {
  step "Backend (Spring Boot :$BACKEND_PORT)"
  if backend_up; then ok "already running"; return; fi
  if ss -ltn 2>/dev/null | grep -q ":$BACKEND_PORT "; then
    bad "port $BACKEND_PORT busy" "something else is listening but not healthy"; fix "free the port or stop the old backend"; return
  fi
  use_java21 || { bad "Java 21 missing"; return; }
  launch backend "$ROOT/backend" ./mvnw -q spring-boot:run
  # On /mnt/c (Windows files) compile + startup can take 4-6 min, so wait up to 8.
  if wait_for "backend (compiles first; slow on /mnt/c, up to 8 min)" 480 backend_up "$RUN/backend.log"; then ok "started" "log: .run/backend.log"
  elif grep -qE 'APPLICATION FAILED|Application run failed|BUILD FAILURE|COMPILATION ERROR' "$RUN/backend.log"; then
    bad "did not start" "log: .run/backend.log"
    grep -E 'Caused by|APPLICATION FAILED|ERROR' "$RUN/backend.log" | tail -3 | sed 's/^/      /'
  else
    bad "still starting" "no error in .run/backend.log yet"
    fix "give it a minute, then: scripts/dev.sh check"
  fi
}

start_frontend() {
  step "Frontend (Vite :$FRONTEND_PORT)"
  if frontend_up; then ok "already running"; return; fi
  if [ ! -f "$ROOT/frontend/node_modules/vite/bin/vite.js" ] || [ ! -d "$ROOT/frontend/node_modules/@rolldown/binding-linux-x64-gnu" ]; then
    bad "frontend dependencies" "missing or installed without Linux support"
    fix "in Windows PowerShell: cd frontend; pnpm install   (uses frontend/.npmrc: flat, Windows + Linux)"; return
  fi
  # vite.js directly: works whichever OS created node_modules/.bin
  launch frontend "$ROOT/frontend" node node_modules/vite/bin/vite.js
  if wait_for "frontend" 90 frontend_up "$RUN/frontend.log"; then ok "started" "log: .run/frontend.log"
  else bad "did not start" "see .run/frontend.log"; tail -3 "$RUN/frontend.log" | sed 's/^/      /'; fi
}

start_ngrok() {
  step "ngrok tunnel ($NGROK_DOMAIN → :$BACKEND_PORT)"
  [ -n "$NGROK_DOMAIN" ] || { warn "skipped" "APP_REDIRECT_BASE_URL not set"; return; }
  command -v ngrok >/dev/null || { warn "skipped" "ngrok not installed"; return; }
  if public_up; then ok "already online"; return; fi
  if pgrep -x ngrok >/dev/null; then
    warn "ngrok is running" "but the public URL doesn't reach the backend yet"; return
  fi
  launch ngrok "$ROOT" ngrok http --url="$NGROK_DOMAIN" "$BACKEND_PORT" --log=stdout
  if wait_for "tunnel" 30 public_up "$RUN/ngrok.log"; then ok "online" "$PUBLIC_URL"
  elif grep -q ERR_NGROK_334 "$RUN/ngrok.log"; then
    bad "domain already in use" "another ngrok has this domain open"; fix "close the other ngrok (other terminal/PC), then rerun"
  else bad "tunnel not reachable" "see .run/ngrok.log"; fi
}

# ---------- checks ----------
checks() {
  step "Checks"
  local s
  [ "$(docker inspect -f '{{.State.Health.Status}}' tenashop-postgres-1 2>/dev/null)" = healthy ] && ok "Postgres :5544" || bad "Postgres" "not healthy"
  [ "$(docker inspect -f '{{.State.Health.Status}}' tenashop-kafka-1 2>/dev/null)" = healthy ] && ok "Kafka :29492" || bad "Kafka" "not healthy"
  [ "$(docker inspect -f '{{.State.Health.Status}}' tenashop-media-1 2>/dev/null)" = healthy ] && ok "Photo storage (S3) :9910" "file browser http://localhost:9911" || bad "Photo storage" "media container not healthy"
  [ "$(http_code "http://localhost:$KAFKA_UI_PORT/")" = 200 ] && ok "Kafka UI" "http://localhost:$KAFKA_UI_PORT" || warn "Kafka UI" "not answering yet"
  [ "$(http_code "http://localhost:$PROMETHEUS_PORT/-/ready")" = 200 ] && ok "Prometheus :$PROMETHEUS_PORT" "alerts http://localhost:$PROMETHEUS_PORT/alerts" || warn "Prometheus" "not answering yet"
  [ "$(http_code "http://localhost:$GRAFANA_PORT/api/health")" = 200 ] && ok "Grafana :$GRAFANA_PORT" "dashboards http://localhost:$GRAFANA_PORT" || warn "Grafana" "not answering yet"
  [ "$(http_code "http://localhost:$ALERTMANAGER_PORT/-/ready")" = 200 ] && ok "Alertmanager :$ALERTMANAGER_PORT" "alert emails go to Mailpit" || warn "Alertmanager" "not answering yet (alerts are not emailed)"
  [ "$(http_code "http://localhost:$MAILPIT_UI_PORT/livez")" = 200 ] && ok "Mailpit (email) :$MAILPIT_UI_PORT" "customer emails land here" || warn "Mailpit" "not answering yet"

  local health; health=$(curl -s -m 5 "http://localhost:$BACKEND_PORT/actuator/health" 2>/dev/null)
  # The overall status is only UP when the database and Kafka checks are UP too.
  if echo "$health" | grep -qE '^\{"(components|status)"' && echo "$health" | grep -qE '"status":"UP"\}?$|"status":"UP"\}$'; then
    ok "Backend health" "UP (database, Kafka)"
  elif [ -n "$health" ]; then bad "Backend health" "$(echo "$health" | grep -oE '"status":"[A-Z_]+"' | tail -1)"
  else bad "Backend" "not answering on :$BACKEND_PORT"; fi
  s=$(http_code "http://localhost:$BACKEND_PORT/api/products/featured"); [ "$s" = 200 ] && ok "Catalog API" || bad "Catalog API" "HTTP $s"
  # Is Prometheus actually getting the backend's metrics?
  local up; up=$(curl -s -m 5 "http://localhost:$PROMETHEUS_PORT/api/v1/query" --data-urlencode 'query=up{job="tenashop-backend"}' 2>/dev/null)
  if echo "$up" | grep -q '"result":\[{'; then
    echo "$up" | grep -q '"1"\]' && ok "Metrics scraped" "backend → Prometheus" \
      || { warn "Metrics scraped" "Prometheus can't read /actuator/prometheus (scraped every 15 s)"; fix "restart the backend to load the metrics endpoint: scripts/dev.sh restart"; }
  fi

  frontend_up && ok "Frontend" "http://localhost:$FRONTEND_PORT" || bad "Frontend" "not answering on :$FRONTEND_PORT"
  s=$(http_code "http://localhost:$FRONTEND_PORT/api/categories"); [ "$s" = 200 ] && ok "Frontend → API proxy" || bad "Frontend → API proxy" "HTTP $s"
  s=$(http_code "http://localhost:$FRONTEND_PORT/products/clay-jebena.jpg"); [ "$s" = 200 ] && ok "Product photos" || warn "Product photos" "HTTP $s"

  if [ -n "$NGROK_DOMAIN" ]; then
    public_up && ok "Public URL → backend" "$PUBLIC_URL" || { bad "Public URL → backend" "$PUBLIC_URL"; fix "BillPay redirects and webhooks need this; run: scripts/dev.sh"; }
  fi

  # Which BillPay new orders use is picked in Admin → BillPay setup; ask the running backend
  if backend_up; then
    case "$(curl -s -m 5 "http://localhost:$BACKEND_PORT/api/store-info")" in
      *'"sandbox":false'*) ok "Payment mode" "LIVE: real money (switch in Admin → BillPay setup)" ;;
      *'"sandbox":true'*)  ok "Payment mode" "SANDBOX: test money (switch in Admin → BillPay setup)" ;;
      *)                   warn "Payment mode" "backend didn't say" ;;
    esac
  fi
  billpay_keys SANDBOX true
  billpay_keys LIVE false
  [ "$(envget BILLPAY_WEBHOOK_VERIFICATION)" = "HMAC_SHA256" ] && ok "Webhook signatures" "enforced" \
    || warn "Webhook signatures" "NOT enforced ($(envget BILLPAY_WEBHOOK_VERIFICATION)); live mode needs HMAC_SHA256"
}

# Checks one environment's key against BillPay (read-only call) and that its webhook secret is set.
billpay_keys() { # SANDBOX|LIVE required(true|false)
  local env=$1 required=$2 url key secret label s
  url=$(envget "BILLPAY_${env}_BASE_URL"); key=$(envget "BILLPAY_${env}_API_KEY"); secret=$(envget "BILLPAY_${env}_WEBHOOK_SECRET")
  [ "$env" = LIVE ] && { url=${url:-https://api.billpay.et}; label="BillPay live"; } || { url=${url:-https://sandbox.api.billpay.et}; label="BillPay sandbox"; }
  if [ -z "$key" ] || [ "$key" = "BPG_TEST-replace-me" ]; then
    if [ "$required" = true ]; then bad "$label key" "BILLPAY_${env}_API_KEY not set in .env"; else warn "$label key" "not set (only needed for live)"; fi
    return
  fi
  s=$(curl -s -m 15 -o /dev/null -w '%{http_code}' -H "x-api-key: $key" "$url/api/v1/checkout/refunds?size=1")
  case "$s" in
    200) ok "$label key" "accepted (${key:0:9}…${key: -4})" ;;
    401|403) bad "$label key" "rejected by BillPay (HTTP $s)"; fix "check the key, and Developers → IP whitelist ($(curl -s -m 5 https://api.ipify.org))" ;;
    000) bad "$label" "unreachable from here ($url)" ;;
    *)   warn "$label key" "unexpected HTTP $s" ;;
  esac
  if [ -n "$secret" ]; then ok "$label webhook secret" "set (${secret:0:6}…${secret: -4})"
  else warn "$label webhook secret" "BILLPAY_${env}_WEBHOOK_SECRET not set"; fi
}

summary() {
  step "Links"
  printf "  Store        http://localhost:%s\n" "$FRONTEND_PORT"
  printf "  Admin        http://localhost:%s/admin   (%s)\n" "$FRONTEND_PORT" "$(envget ADMIN_EMAIL)"
  printf "  API docs     http://localhost:%s/swagger-ui.html\n" "$BACKEND_PORT"
  printf "  Kafka UI     http://localhost:%s\n" "$KAFKA_UI_PORT"
  printf "  Grafana      http://localhost:%s   (dashboards; sign in as admin to edit)\n" "$GRAFANA_PORT"
  printf "  Prometheus   http://localhost:%s/alerts\n" "$PROMETHEUS_PORT"
  printf "  Alertmanager http://localhost:%s   (silence alerts; alert emails land in Mailpit)\n" "$ALERTMANAGER_PORT"
  printf "  Emails       http://localhost:%s   (test inbox: every customer email)\n" "$MAILPIT_UI_PORT"
  [ -n "$PUBLIC_URL" ] && printf "  Public URL   %s  (webhook: %s/api/webhooks/billpay)\n" "$PUBLIC_URL" "$PUBLIC_URL"
  echo
  if [ "$FAILS" -eq 0 ]; then printf "${G}${B}All good.${N} Logs: scripts/dev.sh logs backend|frontend|ngrok\n"
  else printf "${R}${B}%d problem(s) above.${N} Fix them and run scripts/dev.sh again.\n" "$FAILS"; fi
}

# ---------- smoke test ----------
smoke() {
  step "Smoke test"
  local api="http://localhost:$BACKEND_PORT/api" j='Content-Type: application/json' email body token s
  email="smoke$(date +%s)@example.et"
  s=$(curl -s -o /dev/null -w '%{http_code}' "$api/products?size=1"); [ "$s" = 200 ] && ok "list products" || bad "list products" "HTTP $s"
  body=$(curl -s -w '\n%{http_code}' -X POST "$api/auth/register" -H "$j" -d "{\"fullName\":\"Smoke Test\",\"email\":\"$email\",\"password\":\"smoke1234\"}")
  [ "$(tail -1 <<<"$body")" = 200 ] && ok "customer sign-up" "$email" || bad "customer sign-up" "HTTP $(tail -1 <<<"$body")"
  token=$(head -1 <<<"$body" | sed -E 's/.*"token":"([^"]+)".*/\1/')
  s=$(curl -s -o /dev/null -w '%{http_code}' "$api/me" -H "Authorization: Bearer $token"); [ "$s" = 200 ] && ok "customer session" || bad "customer session" "HTTP $s"
  s=$(curl -s -o /dev/null -w '%{http_code}' "$api/admin/orders" -H "Authorization: Bearer $token"); [ "$s" = 403 ] && ok "customer kept out of admin" || bad "customer kept out of admin" "HTTP $s"
  s=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$api/admin/auth/login" -H "$j" \
      -d "{\"email\":\"$(envget ADMIN_EMAIL)\",\"password\":\"$(envget ADMIN_PASSWORD)\"}")
  [ "$s" = 200 ] && ok "admin sign-in" || warn "admin sign-in" "HTTP $s (password in .env may differ from the one you set)"
  s=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$api/webhooks/billpay" -H "$j" -H 'X-Billpay-Signature: t=1,v1=00' -d '{"eventType":"PaymentCaptured","data":{}}')
  [ "$s" = 401 ] && ok "forged webhook rejected" || warn "forged webhook" "HTTP $s (expected 401 when signatures are enforced)"
}

# ---------- stop ----------
stop_one() {
  local name=$1 pid
  [ -f "$RUN/$name.pid" ] || { printf "  - %-10s not started by this script\n" "$name"; return; }
  pid=$(cat "$RUN/$name.pid")
  if kill -0 "$pid" 2>/dev/null; then kill -- -"$pid" 2>/dev/null || kill "$pid"; printf "  ${G}✔${N} %-10s stopped\n" "$name"
  else printf "  - %-10s was not running\n" "$name"; fi
  rm -f "$RUN/$name.pid"
}

# Stops the TenaShop backend on $BACKEND_PORT even if it was started in another terminal (./mvnw spring-boot:run).
# Only touches a process whose command line points at this repo's backend.
stop_backend_any() {
  stop_one backend
  local pid ppid i
  pid=$(ss -ltnp 2>/dev/null | grep ":$BACKEND_PORT " | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)
  [ -z "$pid" ] && return
  if ! tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | grep -q "$ROOT/backend"; then
    bad "port $BACKEND_PORT" "held by something that isn't this project's backend (pid $pid); left alone"; return
  fi
  ppid=$(ps -o ppid= -p "$pid" | tr -d ' ')
  kill "$pid" 2>/dev/null
  # the Maven process that launched it (spring-boot:run) exits by itself; stop it if it doesn't
  for i in $(seq 1 30); do ss -ltn 2>/dev/null | grep -q ":$BACKEND_PORT " || break; sleep 1; done
  [ -n "$ppid" ] && tr '\0' ' ' < "/proc/$ppid/cmdline" 2>/dev/null | grep -q plexus-classworlds && kill "$ppid" 2>/dev/null
  if ss -ltn 2>/dev/null | grep -q ":$BACKEND_PORT "; then bad "backend (pid $pid)" "still running after 30 s"
  else printf "  ${G}✔${N} %-10s stopped (pid %s)\n" "backend" "$pid"; fi
}

# Load-test environment (Admin → Load tests): a separate copy of the shop, own database and Kafka, fake BillPay.
perf_up() {
  step "Load-test environment (separate shop copy, fake BillPay; your data is not touched)"
  (cd "$ROOT" && docker compose --profile perf up -d --build perf-runner >"$RUN/perf.log" 2>&1) \
    || { bad "docker compose --profile perf up" "see .run/perf.log"; tail -5 "$RUN/perf.log" | sed 's/^/      /'; return; }
  ok "containers started" "first start builds the shop image (a few minutes)"
  if wait_for "test shop on :8282" 300 perf_backend_up; then ok "test shop" "http://localhost:8282 (admin perf-admin@perf.local)"
  else bad "test shop" "not healthy yet"; fix "docker compose --profile perf logs perf-backend | tail -40"; fi
  [ "$(http_code http://localhost:9930/health)" = 200 ] && ok "load-test runner :9930" "open Admin → Load tests" || bad "load-test runner" "not answering on :9930"
}
perf_backend_up() { [ "$(http_code http://localhost:8282/actuator/health)" = 200 ]; }

case "${1:-restart}" in
  perf)      perf_up ;;
  perf-down) step "Stopping the load-test environment"; (cd "$ROOT" && docker compose --profile perf stop perf-runner perf-backend perf-billpay perf-kafka >/dev/null 2>&1) && ok "stopped" "data kept; scripts/dev.sh perf starts it again" ;;
  up|start) prereqs; start_infra; start_backend; start_frontend; start_ngrok; checks; summary ;;
  restart)  step "Stopping backend (to load new code; 'scripts/dev.sh up' keeps it running)"; stop_backend_any
            prereqs; start_infra; start_backend; start_frontend; start_ngrok; checks; summary ;;
  check)    use_java21 >/dev/null; checks; summary ;;
  test)     checks; smoke; summary ;;
  logs)     f="$RUN/${2:-backend}.log"; [ -f "$f" ] && tail -f "$f" || echo "no log at $f (was it started by this script?)" ;;
  stop)     step "Stopping"; stop_one ngrok; stop_one frontend; stop_one backend ;;
  stop-all) step "Stopping"; stop_one ngrok; stop_one frontend; stop_one backend; (cd "$ROOT" && docker compose stop) ;;
  *)        sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
[ "$FAILS" -eq 0 ]
