import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'

import type { FulfilmentStatus } from '@/lib/api'
import { formatDate, formatETB } from '@/lib/format'
import { useT } from '@/lib/i18n'
import type { SellerOrderRow } from '@/lib/seller-api'

export const FULFILMENT_LABEL: Record<FulfilmentStatus, string> = {
  UNFULFILLED: 'Paid, to pack',
  PROCESSING: 'Packing',
  SHIPPED: 'On the way',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
}

export function OrderLine({ o }: { o: SellerOrderRow }) {
  const t = useT()
  return (
    <Link to={`/seller/orders/${o.orderNumber}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-muted/50">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">
          {o.otherSellers ? o.parcelNumber : o.orderNumber} · {t(o.units === 1 ? '{n} item' : '{n} items', { n: o.units })}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {o.customerName}{o.deliveryCity && ` · ${o.deliveryCity}`} · {t('paid {date}', { date: formatDate(o.paidAt) })}
          {o.otherSellers && ` · ${t('part of a bigger order')}`}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold tabular-nums">{formatETB(o.itemsTotal)}</p>
        {o.fulfilmentStatus && <p className="text-[11px] text-muted-foreground">{t(FULFILMENT_LABEL[o.fulfilmentStatus])}</p>}
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  )
}
