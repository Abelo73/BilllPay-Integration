import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { problemApi } from '@/lib/dispute-api'
import { formatETB } from '@/lib/format'
import { t as tr, useT } from '@/lib/i18n'

/**
 * Paid, and the seller hasn't started packing: the buyer can cancel this parcel and get its money back through
 * BillPay. If BillPay refuses (e.g. its refund limit), nothing is cancelled and the reason is shown.
 */
export function CancelParcel({ orderNumber, parcelNo, amount, seller, cash = false }: { orderNumber: string; parcelNo: number; amount: number; seller?: string | null; cash?: boolean }) {
  const t = useT()
  const qc = useQueryClient()
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState('')
  const cancel = useMutation({
    mutationFn: () => problemApi.cancelParcel(orderNumber, parcelNo, reason.trim() || undefined),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['order-status', orderNumber] })
      setAsking(false)
      toast.success(cash ? tr('Cancelled. Nothing was charged.') : tr('Cancelled. {amount} is on its way back to you through BillPay.', { amount: formatETB(r.refunded) }))
    },
    onError: (e) => toast.error(e.message),
  })

  if (!asking) {
    return (
      <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground" onClick={() => setAsking(true)}>
        <Undo2 /> {cash
          ? seller ? t('Cancel the items from {seller}', { seller }) : t('Cancel this order')
          : seller ? t('Cancel the items from {seller} and get a refund', { seller }) : t('Cancel and get a refund')}
      </Button>
    )
  }
  return (
    <form
      className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        cancel.mutate()
      }}
    >
      <p className="text-sm font-semibold">{cash ? t('Cancel this cash order?') : t('Cancel and get {amount} back?', { amount: formatETB(amount) })}</p>
      <p className="text-xs text-muted-foreground">{cash ? t('You can cancel until the seller starts packing. You pay nothing.')
        : t("You can cancel until the seller starts packing. The money goes back to how you paid; banks can take a few days.")}</p>
      <Textarea rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('Why? (optional)')} aria-label={t('Why? (optional)')} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" variant="destructive" disabled={cancel.isPending}>
          {cancel.isPending && <Loader2 className="animate-spin" />} {cash ? t('Yes, cancel') : t('Yes, cancel and refund')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setAsking(false)}>{t('Keep the order')}</Button>
      </div>
    </form>
  )
}
