import { useMutation } from '@tanstack/react-query'
import { Check, HandCoins, Loader2, RotateCcw, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { problemApi, type Problem } from '@/lib/dispute-api'
import { formatETB } from '@/lib/format'
import { t as tr, useT } from '@/lib/i18n'

/**
 * Settling a problem without waiting for staff.
 * Seller: refund in full at once, or offer part of the money back. Buyer: accept or decline the seller's offer.
 * Shows nothing when this person has nothing to decide.
 */
export function ProblemSettle({ p, onChange }: { p: Problem; onChange: (p: Problem) => void }) {
  if (p.canAnswerOffer && p.sellerOffer != null) return <OfferForBuyer p={p} onChange={onChange} />
  if (p.canRefund) return <SellerRefund p={p} onChange={onChange} />
  return null
}

function OfferForBuyer({ p, onChange }: { p: Problem; onChange: (p: Problem) => void }) {
  const t = useT()
  const accept = useMutation({
    mutationFn: () => problemApi.acceptOffer(p.id),
    onSuccess: (x) => { onChange(x); toast.success(tr('Accepted: {amount} is on its way back to you.', { amount: formatETB(p.sellerOffer ?? 0) })) },
    onError: (e) => toast.error(e.message),
  })
  const decline = useMutation({
    mutationFn: () => problemApi.declineOffer(p.id),
    onSuccess: (x) => { onChange(x); toast.success(tr('Declined. Sodo Gebeya will decide.')) },
    onError: (e) => toast.error(e.message),
  })
  const busy = accept.isPending || decline.isPending
  return (
    <section className="space-y-3 rounded-2xl border-2 border-market/60 bg-market/10 p-4" aria-label={t('Offer from the seller')}>
      <p className="flex items-center gap-2 font-semibold">
        <HandCoins className="size-5 shrink-0" />
        {t('The seller offers {amount} back. You keep the items.', { amount: formatETB(p.sellerOffer ?? 0) })}
      </p>
      <p className="text-sm text-muted-foreground">
        {t('Accept and the money goes back to you through BillPay; the seller is paid the rest. Decline and Sodo Gebeya decides.')}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => accept.mutate()}>
          {accept.isPending ? <Loader2 className="animate-spin" /> : <Check />} {t('Accept {amount}', { amount: formatETB(p.sellerOffer ?? 0) })}
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => decline.mutate()}>
          {decline.isPending ? <Loader2 className="animate-spin" /> : <X />} {t('Decline')}
        </Button>
      </div>
    </section>
  )
}

function SellerRefund({ p, onChange }: { p: Problem; onChange: (p: Problem) => void }) {
  const t = useT()
  const [mode, setMode] = useState<'none' | 'full' | 'part'>('none')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const refund = useMutation({
    mutationFn: () => problemApi.sellerRefund(p.id, mode === 'part' ? Number(amount) : undefined, note.trim() || undefined),
    onSuccess: (x) => {
      onChange(x)
      setMode('none')
      toast.success(mode === 'part' ? tr('Offer sent. The buyer accepts or declines.') : tr('Refunded in full. The buyer has been told.'))
    },
    onError: (e) => toast.error(e.message),
  })
  const partValue = Number(amount)
  const partOk = mode !== 'part' || (partValue > 0 && partValue < p.parcelTotal)

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4" aria-label={t('Settle it yourself')}>
      <div>
        <p className="font-semibold">{t('Settle it yourself')}</p>
        <p className="text-sm text-muted-foreground">
          {p.sellerOffer != null
            ? t('You offered {amount}; waiting for the buyer. You can still refund in full.', { amount: formatETB(p.sellerOffer) })
            : t('Refund the buyer, or offer part back for a small fault. Otherwise Sodo Gebeya decides.')}
        </p>
      </div>
      {mode === 'none' ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setMode('full')}>
            <RotateCcw /> {t('Refund in full ({amount})', { amount: formatETB(p.parcelTotal) })}
          </Button>
          <Button variant="outline" onClick={() => setMode('part')}>
            <HandCoins /> {t('Offer part back')}
          </Button>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (partOk) refund.mutate()
          }}
        >
          {mode === 'part' && (
            <div className="space-y-1.5">
              <Label htmlFor="offer-amount">{t('Amount to give back (birr)')}</Label>
              <Input id="offer-amount" type="number" inputMode="decimal" min="0.01" step="0.01" max={p.parcelTotal - 0.01}
                value={amount} onChange={(e) => setAmount(e.target.value)} className="max-w-48" required aria-invalid={!partOk} />
              <p className="text-xs text-muted-foreground">{t('Less than {amount}; the buyer must accept it.', { amount: formatETB(p.parcelTotal) })}</p>
            </div>
          )}
          {mode === 'full' && (
            <p className="rounded-lg bg-muted/60 p-2.5 text-sm">
              {t('The buyer gets {amount} back now through BillPay and you are not paid for this order.', { amount: formatETB(p.parcelTotal) })}
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="refund-note">{t('Message to the buyer (optional)')}</Label>
            <Textarea id="refund-note" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={refund.isPending || !partOk}>
              {refund.isPending && <Loader2 className="animate-spin" />} {mode === 'part' ? t('Send offer') : t('Refund now')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode('none')}>{t('Cancel')}</Button>
          </div>
        </form>
      )}
    </section>
  )
}
