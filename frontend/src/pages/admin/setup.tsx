import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Circle, XCircle } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { adminApi } from '@/lib/admin-api'
import { PageHeader } from './shared'

const SCENARIOS = [
  ['Any other number, or tok_success', 'Paid after a few seconds', '—', 'TC-01–03'],
  ['Number ending 0000, or tok_insufficient_funds', 'Refused', 'INSUFFICIENT_FUNDS', 'TC-04'],
  ['Number ending 1111, or tok_declined', 'Refused', 'CUSTOMER_DECLINED', 'TC-05'],
  ['Number ending 2222', 'Refused', 'ACCOUNT_BLOCKED', 'TC-06'],
  ['Number ending 3333', 'Refused', 'LIMIT_EXCEEDED', 'TC-07'],
  ['tok_expired_card', 'Refused', 'CARD_EXPIRED', 'TC-08'],
  ['Number ending 8888', 'Paid after two minutes', '—', 'TC-09'],
  ['Number ending 9999, or tok_timeout', 'Stays pending, then expires', '—', 'TC-10'],
  ['Refund amount ending in .13', 'Refund refused', 'REFUND_REFUSED', 'TC-22'],
]

function Check({ ok, warn, children }: { ok: boolean; warn?: boolean; children: React.ReactNode }) {
  const Icon = ok ? CheckCircle2 : warn ? Circle : XCircle
  return (
    <li className="flex items-start gap-3 text-sm">
      <Icon className={`mt-0.5 size-4 shrink-0 ${ok ? 'text-success' : warn ? 'text-warning' : 'text-destructive'}`} />
      <span>{children}</span>
    </li>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{children}</code>
}

export function AdminSetupPage() {
  const { data: c } = useQuery({ queryKey: ['admin-config'], queryFn: adminApi.config })

  return (
    <>
      <PageHeader title="BillPay setup" description="What's configured, how to connect webhooks, and the sandbox test values." />

      {c && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configuration</CardTitle>
            <CardDescription>
              From <Code>.env</Code>. Restart the backend after changing it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              <Check ok>
                BillPay API: <Code>{c.billpayBaseUrl}</Code> ({c.sandbox ? 'sandbox' : 'live'})
              </Check>
              <Check ok={c.apiKeyConfigured}>
                API key {c.apiKeyConfigured ? <Code>{c.apiKeyHint ?? 'set'}</Code> : <>missing — set <Code>BILLPAY_API_KEY</Code></>}
              </Check>
              <Check ok={c.webhookSecretConfigured} warn>
                Webhook secret {c.webhookSecretConfigured ? 'set' : <>not set — paste it into <Code>BILLPAY_WEBHOOK_SECRET</Code></>}
              </Check>
              <Check ok={c.webhookVerification !== 'NONE'} warn={c.sandbox}>
                Signature enforcement: <Code>{c.webhookVerification}</Code>
                {c.webhookVerification === 'NONE' &&
                  (c.webhookSecretConfigured
                    ? ' — each delivery is probed; check the scheme on the Webhooks page, then switch to HMAC_SHA256.'
                    : ' — sandbox only.')}
              </Check>
              <Check ok>
                Return/cancel URLs built from <Code>{c.publicBaseUrl}</Code>
              </Check>
              <Check ok>
                Reconcile pending payments after <Code>{c.reconcileAfter}</Code>, expire unpaid orders after <Code>{c.paymentExpiry}</Code>
              </Check>
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connect BillPay webhooks</CardTitle>
          <CardDescription>BillPay signs every event (payment captured, failed, refunded, settled) with a secret it shows only once.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-3 pl-5 text-sm marker:text-muted-foreground">
            <li>
              Expose the backend publicly: <Code>ngrok http 8181</Code> or <Code>cloudflared tunnel --url http://localhost:8181</Code>.
            </li>
            <li>
              In the BillPay dashboard (Test mode) open <b>Developers → Webhooks → Add endpoint</b> and enter{' '}
              <Code>https://&lt;your-tunnel&gt;{c?.webhookPath ?? '/api/webhooks/billpay'}</Code>.
            </li>
            <li>
              Copy the signing secret <b>immediately</b> (it is shown once) into <Code>BILLPAY_WEBHOOK_SECRET</Code> and restart the backend.
            </li>
            <li>
              Click <b>send a test delivery</b> in BillPay. Open it on the <b>Webhooks</b> page here: the <i>Signature</i> box shows which
              header and format matched.
            </li>
            <li>
              Set <Code>BILLPAY_WEBHOOK_SIGNATURE_HEADER</Code> to that header and <Code>BILLPAY_WEBHOOK_VERIFICATION=HMAC_SHA256</Code>, then
              restart. From now on unsigned or tampered calls get HTTP 401.
            </li>
            <li>Place an order in the store and watch it move through Payments, Webhooks and the order timeline.</li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sandbox test values</CardTitle>
          <CardDescription>
            Enter these on BillPay’s checkout page (Test Wallet, Test Bank, or Test Card tokens). Never use real card numbers.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Customer enters</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Reason code</TableHead>
                <TableHead className="pr-6">Test case</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {SCENARIOS.map(([input, outcome, code, tc]) => (
                <TableRow key={input}>
                  <TableCell className="pl-6 text-sm">{input}</TableCell>
                  <TableCell className="text-sm">{outcome}</TableCell>
                  <TableCell className="font-mono text-xs">{code}</TableCell>
                  <TableCell className="pr-6 font-mono text-xs text-muted-foreground">{tc}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  )
}
