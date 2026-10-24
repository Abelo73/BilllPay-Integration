import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, FlaskConical, Loader2, Radio, XCircle } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { adminApi, isAdmin, type BillPayEnv, type BillPayModeStatus } from '@/lib/admin-api'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

const INFO: Record<BillPayEnv, { title: string; money: string; envPrefix: string }> = {
  SANDBOX: { title: 'Sandbox', money: 'Test money: nothing is charged', envPrefix: 'BILLPAY_SANDBOX_' },
  LIVE: { title: 'Live', money: 'Real money: customers are charged', envPrefix: 'BILLPAY_LIVE_' },
}

/** Shows which BillPay new orders use and lets an admin switch between sandbox and live, without a restart. */
export function BillPayModeCard({ status }: { status: BillPayModeStatus }) {
  const [target, setTarget] = useState<BillPayEnv | null>(null)
  const editable = isAdmin()

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-base">Payment mode</CardTitle>
          <ModeBadge mode={status.mode} />
        </div>
        <CardDescription>
          Which BillPay new orders are paid through. Switching takes effect at once, with no restart. Orders already
          placed keep the mode they were placed in, and reports show one mode at a time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.fallbackReason && (
          <div className="flex gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">Running on the sandbox: live isn’t safe yet</p>
              <p className="text-muted-foreground">{status.fallbackReason}</p>
            </div>
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {(['SANDBOX', 'LIVE'] as const).map((env) => {
            const e = status.environments[env]
            const active = status.mode === env
            const ready = e.problems.length === 0
            return (
              <div key={env} className={cn('flex flex-col gap-3 rounded-xl border p-4', active && 'border-brand ring-1 ring-brand')}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-2 font-semibold">
                      {env === 'LIVE' ? <Radio className="size-4 text-success" /> : <FlaskConical className="size-4 text-warning" />}
                      {INFO[env].title}
                    </p>
                    <p className="text-xs text-muted-foreground">{INFO[env].money}</p>
                  </div>
                  {active && <Badge variant="outline">In use</Badge>}
                </div>
                <ul className="space-y-1.5 text-sm">
                  <Line ok>
                    <code className="font-mono text-xs">{e.baseUrl}</code>
                  </Line>
                  <Line ok={e.apiKeyConfigured}>
                    API key {e.apiKeyConfigured ? <code className="font-mono text-xs">{e.apiKeyHint ?? 'set'}</code> : 'missing'}
                  </Line>
                  <Line ok={e.webhookSecretConfigured} warn={env === 'SANDBOX'}>
                    Webhook secret {e.webhookSecretConfigured ? 'set' : 'missing'}
                  </Line>
                </ul>
                {e.problems.length > 0 && (
                  <ul className="space-y-1 rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">
                    {e.problems.map((p) => (
                      <li key={p}>• {p}</li>
                    ))}
                  </ul>
                )}
                {!active && editable && (
                  <Button
                    className="mt-auto"
                    variant={env === 'LIVE' ? 'default' : 'outline'}
                    disabled={!ready}
                    onClick={() => setTarget(env)}
                  >
                    Switch to {INFO[env].title.toLowerCase()}
                  </Button>
                )}
              </div>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          {status.changedBy
            ? <>Set to {INFO[status.mode].title.toLowerCase()} by {status.changedBy}, {formatDate(status.changedAt)}.</>
            : <>Starting mode from <code className="font-mono">BILLPAY_MODE</code> in .env.</>}{' '}
          Keys and secrets stay in <code className="font-mono">.env</code> ({INFO.SANDBOX.envPrefix}… and {INFO.LIVE.envPrefix}…); they are never
          stored in the database or shown here.
          {!editable && ' Only admins can switch.'}
        </p>
      </CardContent>
      {target && <SwitchDialog target={target} onClose={() => setTarget(null)} />}
    </Card>
  )
}

export function ModeBadge({ mode }: { mode: BillPayEnv }) {
  return mode === 'LIVE' ? (
    <Badge variant="outline" className="gap-1.5 border-success/50 bg-success/10">
      <span className="size-1.5 rounded-full bg-success" /> Live: real money
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1.5 border-warning/50 bg-warning/10">
      <FlaskConical className="size-3" /> Sandbox: test money
    </Badge>
  )
}

function Line({ ok, warn, children }: { ok: boolean; warn?: boolean; children: React.ReactNode }) {
  const Icon = ok ? CheckCircle2 : XCircle
  return (
    <li className="flex items-center gap-2">
      <Icon className={cn('size-4 shrink-0', ok ? 'text-success' : warn ? 'text-warning' : 'text-destructive')} />
      <span className="min-w-0 break-all">{children}</span>
    </li>
  )
}

function SwitchDialog({ target, onClose }: { target: BillPayEnv; onClose: () => void }) {
  const qc = useQueryClient()
  const [typed, setTyped] = useState('')
  const live = target === 'LIVE'
  const sw = useMutation({
    mutationFn: () => adminApi.switchMode(target, live ? typed : undefined),
    onSuccess: () => {
      toast.success(live ? 'Live payments are on. New orders charge real money.' : 'Back on the sandbox. New orders use test money.')
      qc.invalidateQueries() // header badge, store banner, dashboard and reports all depend on the mode
      onClose()
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{live ? 'Switch to live payments?' : 'Switch back to the sandbox?'}</DialogTitle>
          <DialogDescription>
            {live
              ? 'From now on customers pay real money through BillPay, and refunds send real money back. The sandbox banner disappears from the store.'
              : 'New orders will use BillPay test money and the store shows the sandbox banner again. Live orders already placed keep being checked and refunded through live BillPay.'}
          </DialogDescription>
        </DialogHeader>
        <form
          id="mode-form"
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            sw.mutate()
          }}
        >
          {live && (
            <>
              <Label htmlFor="confirm-live">Type LIVE to confirm</Label>
              <Input id="confirm-live" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus />
            </>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="mode-form" variant={live ? 'destructive' : 'default'} disabled={sw.isPending || (live && typed !== 'LIVE')}>
            {sw.isPending && <Loader2 className="animate-spin" />} {live ? 'Go live' : 'Use sandbox'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
