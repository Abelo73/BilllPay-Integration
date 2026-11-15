# BillPay staging on the shared server

The shop runs on the same server as Blink staging, at **https://sodogebeya.blinkethio.com**, as a fully separate project:

```
Internet ──► Blink's Caddy (the only thing on ports 80/443)
               ├── staging.blinkethio.com  ──► Blink (unchanged)
               └── sodogebeya.blinkethio.com  ──► billpay-frontend (nginx) ──► backend ──► its own Postgres, Kafka, photos
```

- Own compose project (`billpay-staging`), own database, Kafka, photo storage and test inbox. Blink's deploys never
  touch it, and this script never touches Blink.
- No port open to the internet. Blink's Caddy reaches the shop's frontend over a shared Docker network, `edge`. Only
  Caddy and the shop's frontend are on it; Blink's database, Kafka and app are not.
- Memory limits add up to about 2 GB (the server had 4.6 GB free on 15 Nov 2026).
- **SANDBOX only.** The script refuses `BILLPAY_MODE=LIVE`. A shop taking real money gets its own server.

## Once: DNS

Add an **A record** `sodogebeya.blinkethio.com → 188.245.91.56`, and wait until `getent hosts sodogebeya.blinkethio.com`
on the server shows that address. Caddy needs it to get the HTTPS certificate.

## Once: the code and the secrets on the server

```bash
# on the server, as blink
mkdir -p ~/billpay && cd ~/billpay && git init -q && git config receive.denyCurrentBranch updateInstead

# on the laptop, in this repo
git push ssh://blink@188.245.91.56/home/blink/billpay main:main

# on the server
cd ~/billpay && cp .env.example .env && chmod 600 .env && nano .env
```

In `.env` on the server (never in git, chat or screenshots):

| Variable | Value |
|---|---|
| `POSTGRES_PASSWORD`, `JWT_SECRET`, `ADMIN_PASSWORD`, `MEDIA_S3_ACCESS_KEY`, `MEDIA_S3_SECRET_KEY` | New random values: `openssl rand -base64 36` each. Not the laptop's. |
| `BILLPAY_MODE` | `SANDBOX` |
| `BILLPAY_SANDBOX_API_KEY`, `BILLPAY_SANDBOX_WEBHOOK_SECRET` | From the BillPay dashboard (Test toggle) |
| `APP_PUBLIC_BASE_URL`, `APP_REDIRECT_BASE_URL` | `https://sodogebeya.blinkethio.com` |
| `APP_WEBHOOK_PUBLIC_URL` | `https://sodogebeya.blinkethio.com/api/webhooks/billpay` (no more ngrok) |
| `MAIL_INBOX_URL` | `http://localhost:8626` (opened through an SSH tunnel, below) |

Then in the **BillPay dashboard (Test)**, set the webhook URL to the same `APP_WEBHOOK_PUBLIC_URL`.

## Once: tell Blink's Caddy about the shop

In Blink's `infra/compose/staging/.env.staging` on the server, add:

```
SHOP_DOMAIN=sodogebeya.blinkethio.com
```

Then deploy Blink as usual (`cd ~/blink && ./scripts/deploy-staging.sh`). That restarts Caddy with the shop's block.
Blink's deploy makes the `edge` network if it's missing.

## Testing without BillPay (fake BillPay)

While BillPay's sandbox is down, the shop can use a pretend BillPay that runs next to it on the server. In `.env`:

```
BILLPAY_SANDBOX_BASE_URL=http://fake-billpay:8080
BILLPAY_SANDBOX_API_KEY=BPG_TEST-fake
BILLPAY_SANDBOX_WEBHOOK_SECRET=<any long random value: openssl rand -hex 24>
```

Deploy (`./deploy/deploy-server.sh`): the fake BillPay starts on its own. Then:
1. **Admin → Features → turn on Online payments** (it is off by default; checkout says "Online payment is turned off").
2. Buy something in the shop. Instead of BillPay's page you land straight on the shop's "waiting for payment" page.
3. On the server, pay it (or fail it): `./deploy/deploy-server.sh pay TS-20261115-00001` or `... pay TS-20261115-00001 failed`.
4. The order turns **PAID** (or payment failed) within seconds, and the delivery shows in **Admin → Webhooks**.

Refunds are accepted as "under review", like the real sandbox. Tried end to end on 15 Nov 2026: order placed, paid
through the signed webhook, PAID.

**When BillPay works again:** set the three lines back to the real sandbox values
(`BILLPAY_SANDBOX_BASE_URL=https://sandbox.api.billpay.et`, the dashboard's key and webhook secret) and deploy. The
fake BillPay stops being started; remove the leftover container with
`docker rm -f billpay-staging-fake-billpay-1`. Orders made with the fake stay in the database as test orders.

## Removing the shop from the server

`./deploy/deploy-server.sh remove` deletes the shop's containers and images. It asks first whether to delete its data
too (type `DELETE`; a last backup is saved to `~/billpay-backups` before). Blink keeps running throughout. Then remove
`SHOP_DOMAIN` from Blink's `.env.staging` and deploy Blink, so Caddy forgets the domain. Nothing else of Blink changes.

## Sign-up codes and real email (Brevo)

With `SIGN_UP_EMAIL_CODE=true` in `.env`, email + password sign-up sends a 6-digit code to the email first; the
account is made only with it (5 minutes, 5 tries, a new code after 1 minute). Phone sign-up is unchanged.

Without a mail server, the codes land in the test inbox (see "The test inbox"). For real inboxes, add to `.env`:

```
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
MAIL_USERNAME=<Brevo SMTP login, Settings → SMTP & API>
MAIL_PASSWORD=<an SMTP key made for the shop alone: sodogebeya-staging>
MAIL_SMTP_AUTH=true
MAIL_STARTTLS=true
MAIL_FROM=Sodo Gebeya <sodogebeya@blinkethio.com>
MAIL_INBOX_URL=
```

Then `./deploy/deploy-server.sh`. Order emails and staff sign-in codes go out for real too. The sender
`sodogebeya@blinkethio.com` is verified in Brevo (DKIM and DMARC on blinkethio.com). This shares Blink staging's
Brevo account (300 emails a day): fine for staging; real customers need the shop's own account and domain.
To go back to the test inbox, empty `SMTP_HOST` and set `MAIL_SMTP_AUTH=false`, `MAIL_STARTTLS=false`.

## Every deploy

```bash
# laptop
git push ssh://blink@188.245.91.56/home/blink/billpay main:main
# server
cd ~/billpay
./deploy/deploy-server.sh backup     # before a deploy with new Flyway migrations
./deploy/deploy-server.sh            # build, start, wait until the shop answers
./deploy/deploy-server.sh status     # containers, memory, last deploys, recent errors
```

Other commands: `logs` (follow the backend log), `stop` (stop the shop; data stays).

## The test inbox

Emails land in the shop's Mailpit, which is only on the server's localhost:

```bash
ssh -L 8626:127.0.0.1:8626 blink@188.245.91.56     # then open http://localhost:8626 on the laptop
```

## Nightly backup

`crontab -e` on the server, then add:

```
30 2 * * * cd /home/blink/billpay && ./deploy/deploy-server.sh backup >> /home/blink/billpay-backups/cron.log 2>&1
```

Backups are in `~/billpay-backups`, the last 14 kept. Blink's backups are separate and unchanged.

## If something goes wrong

| What you see | What to do |
|---|---|
| `sodogebeya.blinkethio.com` shows a 502 | The shop is stopped or starting: `./deploy/deploy-server.sh status`. Blink is not affected. |
| HTTPS error on `sodogebeya.blinkethio.com` | DNS not pointing here yet, or `SHOP_DOMAIN` missing from Blink's `.env.staging` |
| The server is short of memory | `./deploy/deploy-server.sh stop` frees about 2 GB at once. Blink keeps running. |
| Remove the shop completely | `./deploy/deploy-server.sh remove` (see below) |
