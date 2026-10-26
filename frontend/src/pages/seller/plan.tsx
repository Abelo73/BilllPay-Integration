import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BarChart3, Check, Crown, Loader2, Rocket, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { formatETB } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { promoApi, type PromoOverview } from '@/lib/promo-api'
import { cn } from '@/lib/utils'

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

/** Seller → Plan: the Pro shop plan (M17), boosts (M16) and, for Pro shops, statistics. */
export function SellerPlanPage() {
  const t = useT()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['seller-promo'], queryFn: promoApi.overview })
  const set = (o: PromoOverview) => qc.setQueryData(['seller-promo'], o)
  const [months, setMonths] = useState(1)
  const plan = useMutation({
    mutationFn: () => promoApi.plan(months),
    onSuccess: (o) => { set(o); toast.success(t('Request sent. Pay, then type the transaction number below.')) },
    onError: (e) => toast.error(e.message),
  })
  const o = q.data
  if (!o) return <Loader2 className="size-5 animate-spin text-muted-foreground" />
  const waitingPlan = o.planOrders.find((p) => p.status === 'REQUESTED')

  return (
    <div className="space-y-6">
      <section className={cn('space-y-4 rounded-2xl border p-5', o.pro ? 'border-market/50 bg-market/10' : 'bg-card')}>
        <div className="flex flex-wrap items-start gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-market text-[#13201A]"><Crown className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold">{o.pro ? t('Pro shop') : t('Free plan')}</h2>
            <p className="text-sm text-muted-foreground">
              {o.pro
                ? t('Active until {date}. No product limit, Pro badge, statistics and {n} points less commission.', { date: day(o.planUntil), n: o.commissionOff })
                : o.productLimit !== null
                  ? t('{used} of {max} products used.', { used: o.products, max: o.productLimit })
                  : t('No product limit right now.')}
            </p>
          </div>
        </div>
        {o.planOn && (
          <>
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              {[t('No limit on products'), t('Pro badge on your shop and listings'), t('Statistics: who called, chatted and offered'), t('{n} points less commission on online sales', { n: o.commissionOff })].map((x) => (
                <li key={x} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{x}</li>
              ))}
            </ul>
            {waitingPlan ? (
              <PayBox
                title={t('Pro plan, {n} months', { n: waitingPlan.months })}
                amount={waitingPlan.price}
                payTo={o.payTo}
                reference={waitingPlan.paymentReference}
                onReference={(r) => promoApi.planReference(waitingPlan.id, r).then(set)}
                onCancel={() => promoApi.cancelPlan(waitingPlan.id).then(set)}
              />
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {[1, 3, 6, 12].map((m) => (
                  <Button key={m} type="button" size="sm" variant={months === m ? 'default' : 'outline'} aria-pressed={months === m} onClick={() => setMonths(m)}>
                    {m === 1 ? t('1 month') : t('{n} months', { n: m })}
                  </Button>
                ))}
                <span className="text-sm font-semibold">{formatETB(o.planPricePerMonth * months)}</span>
                <Button className="ml-auto bg-market text-[#13201A] hover:bg-market/90" disabled={plan.isPending} onClick={() => plan.mutate()}>
                  {plan.isPending && <Loader2 className="animate-spin" />} {o.pro ? t('Renew Pro') : t('Go Pro')}
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      {o.boostsOn && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Rocket className="size-5 text-primary" />
            <h2 className="text-lg font-bold">{t('Boosts')}</h2>
            <p className="w-full text-sm text-muted-foreground">
              {t('A boosted listing shows first in search and on the home page. 3 days {p3}, 7 days {p7}, 14 days {p14}.', {
                p3: formatETB(o.boostPrices['3']), p7: formatETB(o.boostPrices['7']), p14: formatETB(o.boostPrices['14']),
              })}{' '}
              <Link to="/seller/products" className="font-semibold text-primary hover:underline">{t('Boost from your products list')}</Link>
            </p>
          </div>
          {o.boosts.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t('No boosts yet.')}</p>}
          <ul className="space-y-2">
            {o.boosts.map((b) => (
              <li key={b.id} className="space-y-2 rounded-xl border bg-card p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 font-semibold">{b.productName} · {t('{n} days', { n: b.days })}</span>
                  <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', b.status === 'ACTIVE' ? 'bg-primary text-primary-foreground' : b.status === 'REQUESTED' ? 'bg-market/20 text-market-deep' : 'bg-muted')}>
                    {b.status === 'ACTIVE' ? t('On until {date}', { date: day(b.endsAt) }) : b.status === 'REQUESTED' ? t('Waiting for payment') : b.status === 'ENDED' ? t('Ended') : b.status === 'REJECTED' ? t('Not started') : t('Cancelled')}
                  </span>
                </div>
                {b.status === 'REJECTED' && b.note && <p className="text-destructive">{b.note}</p>}
                {b.status === 'REQUESTED' && (
                  <PayBox amount={b.price} payTo={o.payTo} reference={b.paymentReference}
                    onReference={(r) => promoApi.boostReference(b.id, r).then(set)} onCancel={() => promoApi.cancelBoost(b.id).then(set)} />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {o.pro && <Stats />}
    </div>
  )
}

function PayBox({ title, amount, payTo, reference, onReference, onCancel }: {
  title?: string
  amount: number
  payTo: string | null
  reference: string | null
  onReference: (r: string) => Promise<unknown>
  onCancel: () => Promise<unknown>
}) {
  const t = useT()
  const [ref, setRef] = useState(reference ?? '')
  const [busy, setBusy] = useState(false)
  const run = async (f: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try {
      await f()
      toast.success(ok)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-2 rounded-xl border border-market/40 bg-market/10 p-3 text-sm">
      {title && <p className="font-semibold">{title}</p>}
      <p>
        {payTo
          ? t('Send {amount} by telebirr or bank to {phone}, then type the transaction number. We start it as soon as it arrives.', { amount: formatETB(amount), phone: payTo })
          : t('Send {amount} by telebirr or bank to Sodo Gebeya, then type the transaction number. We start it as soon as it arrives.', { amount: formatETB(amount) })}
      </p>
      <div className="flex flex-wrap gap-2">
        <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder={t('Transaction number')} aria-label={t('Transaction number')} className="h-9 max-w-xs bg-background" />
        <Button size="sm" disabled={ref.trim().length < 3 || busy} onClick={() => run(() => onReference(ref.trim()), t('Thanks! We check it soon.'))}>{t('Send')}</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(onCancel, t('Cancelled'))}><X /> {t('Cancel')}</Button>
      </div>
    </div>
  )
}

function Stats() {
  const t = useT()
  const q = useQuery({ queryKey: ['seller-promo-stats'], queryFn: promoApi.stats })
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-bold"><BarChart3 className="size-5 text-primary" /> {t('Statistics, last 30 days')}</h2>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">{t('Product')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('Phone shown')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('Chats')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('Offers')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {q.data?.map((s) => (
              <tr key={s.productId}>
                <td className="px-3 py-2">{s.name}{s.boosted && <span className="ml-2 rounded bg-market/20 px-1.5 text-[11px] font-semibold text-market-deep">{t('Boosted')}</span>}</td>
                <td className="px-3 py-2 text-right tabular-nums">{s.phoneReveals}</td>
                <td className="px-3 py-2 text-right tabular-nums">{s.chats}</td>
                <td className="px-3 py-2 text-right tabular-nums">{s.offers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** "Boost" on a product: choose days, then pay on the Plan page. */
export function BoostDialog({ productId, productName, onClose }: { productId: number; productName: string; onClose: () => void }) {
  const t = useT()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['seller-promo'], queryFn: promoApi.overview })
  const [days, setDays] = useState(7)
  const boost = useMutation({
    mutationFn: () => promoApi.boost(productId, days),
    onSuccess: (o) => {
      qc.setQueryData(['seller-promo'], o)
      toast.success(t('Boost requested. Pay to start it: see Plan.'))
      onClose()
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Boost “{name}”', { name: productName })}</DialogTitle>
          <DialogDescription>{t('It shows first in search and on the home page, with a Boosted label.')}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label={t('Days')}>
          {[3, 7, 14].map((d) => (
            <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}
              className={cn('rounded-xl border p-3 text-center', days === d ? 'border-2 border-primary bg-primary/5' : 'hover:bg-muted')}>
              <span className="block text-lg font-extrabold">{t('{n} days', { n: d })}</span>
              <span className="block text-sm text-muted-foreground">{q.data ? formatETB(q.data.boostPrices[String(d)]) : '…'}</span>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('Cancel')}</Button>
          <Button disabled={boost.isPending} onClick={() => boost.mutate()}>{boost.isPending && <Loader2 className="animate-spin" />}<Rocket /> {t('Boost')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
