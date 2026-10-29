import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, BadgeCheck, Loader2, Printer, Share2 } from 'lucide-react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { Logo } from '@/components/logo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { formatDate, formatETB } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { orderExtrasApi, type Receipt } from '@/lib/order-extras-api'
import { useOrderPhone } from '@/lib/order-phone'

const REFUND_LABEL: Record<string, string> = {
  REQUESTED: 'requested',
  PENDING: 'BillPay is reviewing it',
  SUCCEEDED: 'refunded',
  PAID_BY_HAND: 'refunded',
  RETRY_LATER: 'BillPay is reviewing it',
  NEEDS_STAFF: 'requested',
}

/** /orders/receipt?order=TS-…: a printable receipt once the order is paid. */
export function OrderReceiptPage() {
  const t = useT()
  const [params] = useSearchParams()
  const order = params.get('order') ?? ''
  const phone = useOrderPhone(order)
  const query = useQuery({
    queryKey: ['order-receipt', order, phone],
    queryFn: () => orderExtrasApi.receipt(order, phone ?? ''),
    enabled: !!order && phone !== null,
    retry: (n, e) => !(e instanceof ApiError && (e.status === 404 || e.status === 409)) && n < 2,
  })

  if (!order || phone === null) return <Navigate to={`/orders/track${order ? `?order=${encodeURIComponent(order)}` : ''}`} replace />

  const back = `/orders/track?order=${encodeURIComponent(order)}`
  return (
    <div className="px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto mb-4 flex max-w-2xl flex-wrap items-center justify-between gap-2 print:hidden">
        <Button asChild variant="ghost" size="sm">
          <Link to={back}><ArrowLeft /> {t('Back to order')}</Link>
        </Button>
        {query.data && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => share(query.data, t)}>
              <Share2 /> {t('Share')}
            </Button>
            <Button size="sm" onClick={() => window.print()}>
              <Printer /> {t('Print or save as PDF')}
            </Button>
          </div>
        )}
      </div>
      {query.isPending ? (
        <div className="grid place-items-center py-24"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>
      ) : query.error ? (
        <div className="mx-auto max-w-md rounded-2xl border p-8 text-center">
          <p className="font-medium">
            {query.error instanceof ApiError && query.error.status === 409
              ? t('The receipt is ready once the order is paid.')
              : t('We couldn’t find this order.')}
          </p>
          <Button asChild variant="outline" className="mt-4"><Link to={back}>{t('Back to order')}</Link></Button>
        </div>
      ) : (
        <ReceiptSheet r={query.data} />
      )}
    </div>
  )
}

function share(r: Receipt, t: ReturnType<typeof useT>) {
  const text = `${t('Sodo Gebeya receipt')} ${r.receiptNumber}: ${formatETB(r.total)} (${t('order')} ${r.orderNumber})`
  if (navigator.share) {
    navigator.share({ title: r.receiptNumber, text, url: window.location.href }).catch(() => {})
  } else {
    navigator.clipboard?.writeText(`${text} ${window.location.href}`).then(() => toast.success(t('Link copied')))
  }
}

function Row({ label, value, strong = false, mono = false }: { label: string; value: React.ReactNode; strong?: boolean; mono?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 text-sm ${strong ? 'text-base font-semibold' : ''}`}>
      <span className={strong ? '' : 'text-muted-foreground'}>{label}</span>
      <span className={`text-right tabular-nums ${mono ? 'font-mono text-xs sm:text-sm' : ''}`}>{value}</span>
    </div>
  )
}

function ReceiptSheet({ r }: { r: Receipt }) {
  const t = useT()
  const cash = r.paymentMethod === 'CASH'
  return (
    <article className="receipt-print relative mx-auto max-w-2xl overflow-hidden rounded-3xl border bg-card shadow-sm print:max-w-none print:rounded-none print:border-0 print:shadow-none">
      {/* torn-paper edge */}
      <div aria-hidden className="h-2 bg-[radial-gradient(circle_at_8px_0,transparent_6px,var(--color-brand)_6.5px)] bg-[length:16px_8px] opacity-80 print:hidden" />
      <header className="flex flex-col gap-4 border-b border-dashed px-6 py-6 sm:flex-row sm:items-start sm:justify-between sm:px-8">
        <div className="space-y-1">
          <Logo />
          <p className="text-xs text-muted-foreground">{t('Wolaita Sodo, Ethiopia')} · sodogebeya.et</p>
        </div>
        <div className="space-y-1 sm:text-right">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{t('Receipt')}</p>
          <p className="font-mono text-lg font-semibold">{r.receiptNumber}</p>
          <p className="text-xs text-muted-foreground">{formatDate(r.paidAt)}</p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 px-6 pt-5 sm:px-8">
        <Badge className="gap-1 bg-success text-white hover:bg-success"><BadgeCheck className="size-3.5" /> {cash ? t('Paid in cash') : t('Paid')}</Badge>
        {r.environment === 'SANDBOX' && !cash && <Badge variant="outline" className="border-warning text-warning">{t('Test payment — no real money')}</Badge>}
        {r.refundedTotal > 0 && <Badge variant="outline">{t('Refunded {amount}', { amount: formatETB(r.refundedTotal) })}</Badge>}
      </div>

      <section className="grid gap-6 px-6 py-5 sm:grid-cols-2 sm:px-8">
        <div className="space-y-1 text-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('Billed to')}</p>
          <p className="font-medium">{r.customerName}</p>
          {r.customerPhone && <p className="text-muted-foreground">{r.customerPhone}</p>}
          {r.customerEmail && <p className="text-muted-foreground">{r.customerEmail}</p>}
        </div>
        <div className="space-y-1 text-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('Deliver to')}</p>
          <p>{r.deliveryAddress ?? '—'}</p>
          {r.deliveryArea && <p className="text-muted-foreground">{r.deliveryArea}, Sodo</p>}
        </div>
      </section>

      <section className="px-6 sm:px-8">
        <div className="overflow-hidden rounded-2xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t('Item')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('Qty')}</th>
                <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">{t('Price')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('Amount')}</th>
              </tr>
            </thead>
            <tbody>
              {r.lines.map((l, i) => (
                <tr key={i} className="border-t align-top">
                  <td className="px-3 py-2.5">
                    <p className="font-medium">{l.name}</p>
                    <p className="text-xs text-muted-foreground">{t('Sold by {seller}', { seller: l.seller })}</p>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{l.quantity}</td>
                  <td className="hidden px-3 py-2.5 text-right tabular-nums sm:table-cell">{formatETB(l.unitPrice)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatETB(l.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ml-auto max-w-sm space-y-2 px-6 py-5 sm:px-8">
        <Row label={t('Subtotal')} value={formatETB(r.subtotal)} />
        {r.discountAmount > 0 && <Row label={t('Discount ({code})', { code: r.discountCode ?? '' })} value={`−${formatETB(r.discountAmount)}`} />}
        <Row label={t('Delivery')} value={r.deliveryFee > 0 ? formatETB(r.deliveryFee) : t('Free')} />
        <div className="border-t pt-2"><Row strong label={t('Total paid')} value={formatETB(r.total)} /></div>
        {r.refunds.map((x, i) => (
          <Row key={i} label={`${t('Refund')} · ${t(REFUND_LABEL[x.status] ?? x.status.toLowerCase())}`} value={`−${formatETB(x.amount)}`} />
        ))}
        {r.refundedTotal > 0 && <Row strong label={t('You paid in the end')} value={formatETB(r.netPaid)} />}
      </section>

      <section className="mx-6 mb-6 space-y-2 rounded-2xl bg-muted/50 p-4 sm:mx-8">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('Payment')}</p>
        <Row label={t('Method')} value={cash ? t('Cash on delivery') : `BillPay${r.paidWith ? ` · ${r.paidWith.replaceAll('_', ' ')}` : ''}`} />
        <Row label={t('Order')} value={r.orderNumber} mono />
        {r.billpayPaymentId && <Row label={t('BillPay payment ID')} value={<span className="break-all">{r.billpayPaymentId}</span>} mono />}
        {r.paymentReference && <Row label={t('Payment reference')} value={r.paymentReference} mono />}
        <Row label={t('Ordered')} value={formatDate(r.orderedAt)} />
        <Row label={t('Paid')} value={formatDate(r.paidAt)} />
      </section>

      <footer className="border-t border-dashed px-6 py-5 text-center text-xs text-muted-foreground sm:px-8">
        <p>{t('Thank you for shopping local on Sodo Gebeya.')}</p>
        <p className="mt-1">{t('Keep this receipt for returns and refunds. Questions? Open your order and tap “Report a problem”.')}</p>
      </footer>
    </article>
  )
}
