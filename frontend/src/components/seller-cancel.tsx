import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { problemApi } from '@/lib/dispute-api'
import { formatETB } from '@/lib/format'
import { t as tr, useT } from '@/lib/i18n'

/** Seller can't send their parcel (sold out, can't deliver): cancel it before it ships; the buyer gets a full refund. */
export function SellerCancel({ orderNumber, amount, cash = false }: { orderNumber: string; amount: number; cash?: boolean }) {
  const t = useT()
  const qc = useQueryClient()
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState('')
  const cancel = useMutation({
    mutationFn: () => problemApi.sellerCancel(orderNumber, reason.trim()),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['seller-order', orderNumber] })
      qc.invalidateQueries({ queryKey: ['seller-orders'] })
      qc.invalidateQueries({ queryKey: ['seller-summary'] })
      setAsking(false)
      toast.success(cash ? tr('Cancelled. The buyer was told why; the items are back on sale.')
        : tr('Cancelled. The buyer gets {amount} back and was told why.', { amount: formatETB(r.refunded) }))
    },
    onError: (e) => toast.error(e.message),
  })

  if (!asking) {
    return (
      <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground" onClick={() => setAsking(true)}>
        <Undo2 /> {cash ? t("Can't send it? Cancel the order") : t("Can't send it? Cancel and refund the buyer")}
      </Button>
    )
  }
  return (
    <form
      className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (reason.trim()) cancel.mutate()
      }}
    >
      <p className="text-sm font-semibold">{t('Cancel your part of this order?')}</p>
      <p className="text-xs text-muted-foreground">
        {cash ? t('Nothing was paid yet, so there is nothing to refund. The items go back on sale.')
          : t('The buyer gets {amount} back through BillPay, you are not paid for it, and the items go back on sale.', { amount: formatETB(amount) })}
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="cancel-reason">{t('Why? (the buyer sees this)')}</Label>
        <Textarea id="cancel-reason" rows={2} maxLength={300} required value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder={t('e.g. Sold out in the shop')} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" variant="destructive" disabled={cancel.isPending || !reason.trim()}>
          {cancel.isPending && <Loader2 className="animate-spin" />} {cash ? t('Cancel the order') : t('Cancel and refund')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setAsking(false)}>{t('Keep it')}</Button>
      </div>
    </form>
  )
}
