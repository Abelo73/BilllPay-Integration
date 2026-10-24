import { useQuery } from '@tanstack/react-query'
import { PackageCheck, Plus } from 'lucide-react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatETB } from '@/lib/format'
import { sellerApi } from '@/lib/seller-api'
import { cn } from '@/lib/utils'
import { OrderLine } from './shared'

function Tile({ value, label, to, warn }: { value: number; label: string; to: string; warn?: boolean }) {
  return (
    <Link to={to} className="rounded-2xl border bg-card p-3 transition hover:border-primary/40">
      <p className={cn('text-2xl font-extrabold tabular-nums', warn && value > 0 && 'text-amber-ink')}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </Link>
  )
}

/** Seller home (design S17): money, what to send now, best sellers, and a big "Add a product". */
export function SellerHomePage() {
  const { data, isLoading } = useQuery({ queryKey: ['seller-summary'], queryFn: sellerApi.summary, refetchInterval: 60_000 })

  if (isLoading || !data) return <Skeleton className="h-96 rounded-2xl" />

  return (
    <div className="space-y-5 pb-20 md:pb-0">
      <div className="space-y-3 rounded-2xl bg-[#1A1F1C] p-5 text-white">
        <div>
          <p className="text-xs text-white/70">Sales this month</p>
          <p className="text-3xl font-extrabold tabular-nums">{formatETB(data.salesThisMonth)}</p>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-white/70">
          <span>Today: <strong className="text-white">{formatETB(data.salesToday)}</strong> from {data.ordersToday} {data.ordersToday === 1 ? 'order' : 'orders'}</span>
          <span>This month: <strong className="text-white">{data.ordersThisMonth}</strong> {data.ordersThisMonth === 1 ? 'order' : 'orders'}, {data.unitsThisMonth} {data.unitsThisMonth === 1 ? 'item' : 'items'}</span>
        </div>
        <p className="text-[11px] text-white/60">Your items only, before fees. Payouts to your account come in a later update.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile value={data.toSend} label="To pack and send" to="/seller/orders" warn />
        <Tile value={data.onTheWay} label="On the way" to="/seller/orders?tab=way" />
        <Tile value={data.inStore} label={`Products shown (of ${data.products})`} to="/seller/products" />
        <Tile value={data.lowStock + data.soldOut} label="Low or sold out" to="/seller/products?status=low" warn />
      </div>

      <section aria-labelledby="to-send" className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 id="to-send" className="text-base font-bold">To pack and send · {data.toSend}</h2>
          <Link to="/seller/orders?tab=all" className="text-sm font-semibold text-primary hover:underline">All orders</Link>
        </div>
        {data.toSendNow.length === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
            <PackageCheck className="size-5 text-success" /> Nothing waiting. New paid orders show up here.
          </div>
        ) : (
          <div className="divide-y overflow-hidden rounded-2xl border bg-card">
            {data.toSendNow.map((o) => <OrderLine key={o.orderNumber} o={o} />)}
          </div>
        )}
      </section>

      {data.bestSellers.length > 0 && (
        <section aria-labelledby="best" className="space-y-2">
          <h2 id="best" className="text-base font-bold">Best sellers this month</h2>
          <ol className="divide-y rounded-2xl border bg-card">
            {data.bestSellers.map((b) => (
              <li key={b.productName} className="flex justify-between gap-3 px-4 py-3 text-sm">
                <span className="truncate">{b.productName}</span>
                <strong className="tabular-nums">{b.units} sold</strong>
              </li>
            ))}
          </ol>
        </section>
      )}

      {data.products === 0 && (
        <p className="rounded-2xl border border-dashed p-5 text-center text-sm text-muted-foreground">
          No products yet. Add your first one: a few clear photos, a fair price and how many you have.
        </p>
      )}

      <div className="fixed inset-x-0 bottom-16 z-30 border-t bg-card p-3 md:static md:border-0 md:bg-transparent md:p-0">
        <Button asChild size="lg" className="h-12 w-full text-base md:w-auto">
          <Link to="/seller/products/new"><Plus /> Add a product</Link>
        </Button>
      </div>
    </div>
  )
}
