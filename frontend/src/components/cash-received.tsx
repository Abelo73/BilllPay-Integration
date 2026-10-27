import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Banknote, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { formatETB } from '@/lib/format'
import { t as tr, useT } from '@/lib/i18n'
import { sellerApi } from '@/lib/seller-api'

/**
 * Cash on delivery (M7), seller side: what to collect, and the "Cash received" button. Tapping it marks the parcel
 * delivered and puts Sodo Gebeya's commission on the seller's balance (they already hold the money).
 */
export function CashReceived({ orderNumber, amount }: { orderNumber: string; amount: number }) {
  const t = useT()
  const qc = useQueryClient()
  const got = useMutation({
    mutationFn: () => sellerApi.cashReceived(orderNumber),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['seller-order', orderNumber] })
      qc.invalidateQueries({ queryKey: ['seller-orders'] })
      qc.invalidateQueries({ queryKey: ['seller-summary'] })
      qc.invalidateQueries({ queryKey: ['seller-money'] })
      toast.success(r.commission > 0
        ? tr('Done: {amount} received. Our commission of {fee} is on your balance.', { amount: formatETB(r.collected), fee: formatETB(r.commission) })
        : tr('Done: {amount} received. The order is complete.', { amount: formatETB(r.collected) }))
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <section className="space-y-3 rounded-2xl border-2 border-market/60 bg-market/10 p-4">
      <p className="flex items-center gap-2 font-bold">
        <Banknote className="size-5 shrink-0" /> {t('Cash order: collect {amount}', { amount: formatETB(amount) })}
      </p>
      <p className="text-sm text-muted-foreground">
        {t('The buyer pays you in cash at the door or when they pick it up. Tap the button only once you have the money.')}
      </p>
      <Button size="lg" className="h-12 w-full" disabled={got.isPending}
        onClick={() => { if (window.confirm(t('Did you receive {amount} in cash?', { amount: formatETB(amount) }))) got.mutate() }}>
        {got.isPending ? <Loader2 className="animate-spin" /> : <Banknote />} {t('Cash received')}
      </Button>
    </section>
  )
}
