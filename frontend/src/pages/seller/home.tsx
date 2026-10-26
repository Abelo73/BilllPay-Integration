import { useQuery } from '@tanstack/react-query'
import { PackageCheck, Plus, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatETB } from '@/lib/format'
import { useFeatures } from '@/lib/features'
import { useT } from '@/lib/i18n'
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

  const { payments } = useFeatures()
  const t = useT()

  if (isLoading || !data) return <Skeleton className="h-96 rounded-2xl" />

  return (
    <div className="space-y-5 pb-20 md:pb-0">
      {!payments && (
        <div className="space-y-3 rounded-2xl bg-[#13201A] p-5 text-white">
          <div>
            <p className="text-xs text-white/70">{t('People who asked for your number (30 days)')}</p>
            <p className="text-3xl font-extrabold tabular-nums">{data.contacts30d}</p>
          </div>
          <p className="text-[11px] text-white/60">{t('Buyers find your listings, then call you or chat in the app. Answer quickly: fast sellers sell more.')}</p>
        </div>
      )}
      {!payments && (
        <div className="grid grid-cols-2 gap-2">
          <Tile value={data.inStore} label={t('Listings shown (of {n})', { n: data.products })} to="/seller/products" />
          <Tile value={data.lowStock + data.soldOut} label={t('Low or sold out')} to="/seller/products?status=low" warn />
        </div>
      )}
      {payments && (<>
      <div className="space-y-3 rounded-2xl bg-[#13201A] p-5 text-white">
        <div>
          <p className="text-xs text-white/70">{t('Sales this month')}</p>
          <p className="text-3xl font-extrabold tabular-nums">{formatETB(data.salesThisMonth)}</p>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-white/70">
          <span>{t('Today:')} <strong className="text-white">{formatETB(data.salesToday)}</strong> {t(data.ordersToday === 1 ? 'from {n} order' : 'from {n} orders', { n: data.ordersToday })}</span>
          <span>{t('This month:')} <strong className="text-white">{data.ordersThisMonth}</strong> {t(data.ordersThisMonth === 1 ? 'order' : 'orders')}, {t(data.unitsThisMonth === 1 ? '{n} item' : '{n} items', { n: data.unitsThisMonth })}</span>
        </div>
        <p className="text-[11px] text-white/60">{t('Your items only, before fees.')} <Link to="/seller/money" className="font-semibold text-white underline">{t('See your money and withdraw')}</Link></p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile value={data.toSend} label={t('To pack and send')} to="/seller/orders" warn />
        <Tile value={data.onTheWay} label={t('On the way')} to="/seller/orders?tab=way" />
        <Tile value={data.inStore} label={t('Products shown (of {n})', { n: data.products })} to="/seller/products" />
        <Tile value={data.lowStock + data.soldOut} label={t('Low or sold out')} to="/seller/products?status=low" warn />
      </div>

      <section aria-labelledby="to-send" className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 id="to-send" className="text-base font-bold">{t('To pack and send')} · {data.toSend}</h2>
          <Link to="/seller/orders?tab=all" className="text-sm font-semibold text-primary hover:underline">{t('All orders')}</Link>
        </div>
        {data.toSendNow.length === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
            <PackageCheck className="size-5 text-success" /> {t('Nothing waiting. New paid orders show up here.')}
          </div>
        ) : (
          <div className="divide-y overflow-hidden rounded-2xl border bg-card">
            {data.toSendNow.map((o) => <OrderLine key={o.orderNumber} o={o} />)}
          </div>
        )}
      </section>
      </>)}

      {!data.shop.verifiedAt && (
        <Link to="/seller/verify" className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 transition hover:border-primary">
          <ShieldCheck className="size-6 shrink-0 text-primary" />
          <span className="flex-1 text-sm">
            <span className="block font-bold">{t('Get the Verified badge')}</span>
            <span className="block text-muted-foreground">{t('Buyers trust verified sellers more. It takes a photo of your ID and a selfie.')}</span>
          </span>
        </Link>
      )}

      {data.bestSellers.length > 0 && (
        <section aria-labelledby="best" className="space-y-2">
          <h2 id="best" className="text-base font-bold">{t('Best sellers this month')}</h2>
          <ol className="divide-y rounded-2xl border bg-card">
            {data.bestSellers.map((b) => (
              <li key={b.productName} className="flex justify-between gap-3 px-4 py-3 text-sm">
                <span className="truncate">{b.productName}</span>
                <strong className="tabular-nums">{t('{n} sold', { n: b.units })}</strong>
              </li>
            ))}
          </ol>
        </section>
      )}

      {data.products === 0 && (
        <p className="rounded-2xl border border-dashed p-5 text-center text-sm text-muted-foreground">
          {t('No products yet. Add your first one: a few clear photos, a fair price and how many you have.')}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-16 z-30 border-t bg-card p-3 md:static md:border-0 md:bg-transparent md:p-0">
        <Button asChild size="lg" className="h-12 w-full text-base md:w-auto">
          <Link to="/seller/products/new"><Plus /> {t('Add a product')}</Link>
        </Button>
      </div>
    </div>
  )
}
