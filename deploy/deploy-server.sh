#!/usr/bin/env bash
# BillPay staging on the shared server (next to Blink staging). Run on the server, in this repo's folder.
#
#   ./deploy/deploy-server.sh            build and start the current checkout, then wait until the shop answers
#   ./deploy/deploy-server.sh status     containers, memory use, last deploys, recent backend errors
#   ./deploy/deploy-server.sh logs       follow the backend log (Ctrl+C to stop)
#   ./deploy/deploy-server.sh backup     dump the shop database to ~/billpay-backups (keeps the last 14)
#   ./deploy/deploy-server.sh stop       stop the shop's containers (data stays; Blink is not touched)
#   ./deploy/deploy-server.sh pay <order number> [failed]
#                                        fake BillPay only: send the signed "paid" (or "failed") webhook for that order
#   ./deploy/deploy-server.sh remove     delete the shop from this server: containers, images and (after asking) its data
#
# Every docker command here is limited to the billpay-staging project. Nothing here touches Blink.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# BILLPAY_ENV_FILE: another .env, for a trial run on the laptop. On the server, leave it unset.
ENV_FILE="${BILLPAY_ENV_FILE:-$ROOT_DIR/.env}"
export BILLPAY_ENV_FILE="$ENV_FILE"
COMPOSE=(docker compose -p billpay-staging --env-file "$ENV_FILE" -f "$ROOT_DIR/deploy/compose.server.yml")
BACKUP_DIR="$HOME/billpay-backups"

log() { printf '[billpay] %s\n' "$*"; }
die() { printf '[billpay] ERROR: %s\n' "$*" >&2; exit 1; }

env_value() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2-; }

# The pretend BillPay runs only when .env points the sandbox at it.
fake_billpay() { [ -f "$ENV_FILE" ] && [[ "$(env_value BILLPAY_SANDBOX_BASE_URL)" == *fake-billpay* ]]; }
if fake_billpay; then export COMPOSE_PROFILES=fake-billpay; fi

check_env() {
  [ -f "$ENV_FILE" ] || die "No .env. Run: cp .env.example .env, then fill it in (see deploy/README.md)."
  local missing=() bad=()
  for name in POSTGRES_PASSWORD JWT_SECRET ADMIN_PASSWORD MEDIA_S3_ACCESS_KEY MEDIA_S3_SECRET_KEY \
              BILLPAY_SANDBOX_API_KEY APP_PUBLIC_BASE_URL APP_REDIRECT_BASE_URL APP_WEBHOOK_PUBLIC_URL; do
    local v; v="$(env_value "$name")"
    [ -n "$v" ] || missing+=("$name")
    case "$v" in change-me*|replace-*|*replace-me*|*localhost*|*ngrok*) bad+=("$name") ;; esac
  done
  [ ${#missing[@]} -eq 0 ] || die "Fill in .env: ${missing[*]}"
  [ ${#bad[@]} -eq 0 ] || die "Still the laptop/example value in .env: ${bad[*]}"
  [ "$(env_value BILLPAY_MODE)" != "LIVE" ] || die "BILLPAY_MODE=LIVE: this server is staging. Keep it SANDBOX."
}

ensure_edge() {
  docker network inspect edge >/dev/null 2>&1 || { log "Making the shared network 'edge'..."; docker network create edge >/dev/null; }
}

wait_until_up() {
  log "Waiting for the backend (first start runs the database migrations)..."
  for _ in $(seq 1 60); do
    if "${COMPOSE[@]}" exec -T frontend wget -q -O /dev/null http://backend:8181/actuator/health 2>/dev/null; then
      log "Backend is up."
      local url; url="$(env_value APP_PUBLIC_BASE_URL)"
      if curl -fsS -o /dev/null --max-time 10 "$url"; then log "The shop answers at $url"; else
        log "Not reachable at $url yet: check DNS and that Blink's Caddy has the shop block (deploy/README.md, step 3)."; fi
      return 0
    fi
    sleep 5
  done
  "${COMPOSE[@]}" logs --tail=80 backend
  die "The backend did not come up in 5 minutes (log above)."
}

deploy() {
  check_env
  ensure_edge
  local commit; commit="$(git -C "$ROOT_DIR" rev-parse --short HEAD)"
  log "Building and starting commit $commit..."
  DOCKER_BUILDKIT=1 "${COMPOSE[@]}" up -d --build --remove-orphans
  echo "$commit $(date -u +%FT%TZ)" >> "$ROOT_DIR/deploy/.deployed"
  wait_until_up
  "${COMPOSE[@]}" ps
}

status() {
  "${COMPOSE[@]}" ps
  log "Memory (limit per container):"
  docker stats --no-stream --format '  {{.Name}}  {{.MemUsage}}' $("${COMPOSE[@]}" ps -q) 2>/dev/null || true
  [ -f "$ROOT_DIR/deploy/.deployed" ] && log "Last deploys:" && tail -3 "$ROOT_DIR/deploy/.deployed"
  log "Recent backend warnings/errors:"
  "${COMPOSE[@]}" logs --since=1h backend 2>/dev/null | grep -E ' (WARN|ERROR) ' | tail -15 || true
}

backup() {
  mkdir -p "$BACKUP_DIR"
  local file="$BACKUP_DIR/billpay-$(date -u +%Y%m%d-%H%M%S).sql.gz"
  "${COMPOSE[@]}" exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip > "$file"
  [ -s "$file" ] || die "The backup is empty."
  ls -1t "$BACKUP_DIR"/billpay-*.sql.gz | tail -n +15 | xargs -r rm --
  log "Saved $file"
}

# Fake BillPay: what the real BillPay sends when a customer pays. Signed with the sandbox webhook secret from .env, on
# the server, so the secret never leaves it. Goes to the backend inside the shop's own network (no domain needed).
pay() {
  local order="${1:-}" outcome="${2:-captured}"
  [ -n "$order" ] || die "Usage: ./deploy/deploy-server.sh pay <order number> [failed]"
  fake_billpay || die "Only with the fake BillPay (BILLPAY_SANDBOX_BASE_URL=http://fake-billpay:8080 in .env)."
  local secret; secret="$(env_value BILLPAY_SANDBOX_WEBHOOK_SECRET)"
  [ -n "$secret" ] || die "Set BILLPAY_SANDBOX_WEBHOOK_SECRET in .env (any long random value with the fake BillPay)."
  local row ref amount
  # The order number goes in as a psql variable (:'o'), never pasted into the SQL.
  row="$(echo "select a.merchant_reference, a.amount from payment_attempts a join orders o on o.id = a.order_id
            where o.order_number = :'o' order by a.attempt_no desc limit 1;" |
    "${COMPOSE[@]}" exec -T postgres sh -c 'psql -At -F" " -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v o="$1"' sh "$order")"
  [ -n "$row" ] || die "No BillPay payment for order $order (was it placed with BillPay, not cash?)."
  read -r ref amount <<<"$row"
  local type; case "$outcome" in captured) type=PaymentCaptured ;; failed) type=PaymentFailed ;; *) die "Use captured or failed." ;; esac
  local body t sig
  body="$(printf '{"eventId":"fake-%s","eventType":"%s","occurredAt":"%s","data":{"paymentId":"fake-%s","merchantReference":"%s","amount":%s,"currency":"ETB","instrument":"TEST_WALLET"}}' \
    "$ref" "$type" "$(date -u +%FT%TZ)" "$ref" "$ref" "$amount")"
  t="$(date +%s)"
  sig="$(printf '%s.%s' "$t" "$body" | openssl dgst -sha256 -hmac "$secret" -r | cut -d' ' -f1)"
  log "Sending $type for $ref ($amount ETB)..."
  docker run --rm --network billpay-staging_default curlimages/curl:8.11.1 -sS -w '\n[billpay] HTTP %{http_code}\n' \
    -X POST http://backend:8181/api/webhooks/billpay -H 'Content-Type: application/json' \
    -H "X-Billpay-Signature: t=$t,v1=$sig" -H "X-Billpay-Event: $type" --data-binary "$body"
  log "Open the order in the shop or Admin → Orders: it should say $([ "$type" = PaymentCaptured ] && echo PAID || echo 'payment failed') in a few seconds."
}

# Deletes the shop from this server. Blink is not touched; only its Caddy block stays (remove SHOP_DOMAIN from
# Blink's .env.staging and deploy Blink to drop it).
remove() {
  log "This stops and deletes the shop's containers and images on this server. Blink keeps running."
  read -r -p "[billpay] Also delete the shop's data (database, photos, emails)? Type DELETE to delete it, Enter to keep it: " answer
  if [ "$answer" = "DELETE" ]; then
    backup || true
    "${COMPOSE[@]}" --profile fake-billpay down --rmi local -v --remove-orphans
    log "Deleted, data too (a last backup is in $BACKUP_DIR)."
  else
    "${COMPOSE[@]}" --profile fake-billpay down --rmi local --remove-orphans
    log "Deleted; the data volumes are kept (docker volume ls | grep billpay-staging)."
  fi
  log "Last step: remove SHOP_DOMAIN from ~/blink/infra/compose/staging/.env.staging and deploy Blink."
}

case "${1:-deploy}" in
  deploy) deploy ;;
  status) status ;;
  logs) "${COMPOSE[@]}" logs -f --tail=100 backend ;;
  backup) backup ;;
  stop) "${COMPOSE[@]}" stop ;;
  pay) shift; pay "$@" ;;
  remove) remove ;;
  *) die "Unknown command: $1 (deploy | status | logs | backup | stop | pay | remove)" ;;
esac
