import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Clock, ExternalLink, Loader2, Store } from 'lucide-react'
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router'

import { Button } from '@/components/ui/button'
import { VerifiedBadge } from '@/components/verified-badge'
import { ApiError } from '@/lib/api'
import { KIND_LABEL, SHOP_STATUS_LABEL, sellerApi, type MyShop } from '@/lib/seller-api'
import { cn } from '@/lib/utils'
import { useSession } from '@/store/session'

const TABS = [
  { to: '/seller', label: 'Home', end: true },
  { to: '/seller/orders', label: 'Orders' },
  { to: '/seller/products', label: 'Products' },
  { to: '/seller/shop', label: 'Shop details' },
  { to: '/seller/verify', label: 'Get verified' },
]

export function ShopLogo({ shop, className }: { shop: Pick<MyShop, 'logoUrl' | 'name'>; className?: string }) {
  return shop.logoUrl ? (
    <img src={shop.logoUrl} alt="" className={cn('size-12 rounded-2xl object-cover ring-1 ring-border', className)} />
  ) : (
    <span className={cn('grid size-12 place-items-center rounded-2xl bg-primary text-lg font-extrabold text-primary-foreground', className)}>
      {shop.name.trim().slice(0, 2).toUpperCase()}
    </span>
  )
}

/** Explains why products aren't in the store yet (or anymore). */
function StatusBanner({ shop }: { shop: MyShop }) {
  if (shop.status === 'APPROVED') return null
  const tone =
    shop.status === 'PENDING'
      ? { cls: 'bg-amber-soft text-amber-ink', icon: Clock, text: 'Sodo Gebeya is checking your shop. Add products now: they show in the store once it\'s approved. We\'ll text you.' }
      : shop.status === 'REJECTED'
        ? { cls: 'bg-destructive/10 text-destructive', icon: AlertTriangle, text: 'Your shop wasn\'t approved. Fix your details in Shop details and it comes back to us.' }
        : { cls: 'bg-destructive/10 text-destructive', icon: AlertTriangle, text: 'Your shop is paused and hidden from the store. Call Sodo Gebeya to sort it out.' }
  return (
    <div className={cn('flex gap-3 rounded-2xl p-4 text-sm', tone.cls)} role="status">
      <tone.icon className="mt-0.5 size-4 shrink-0" />
      <div className="space-y-1">
        <p>{tone.text}</p>
        {shop.statusNote && <p className="font-semibold">Reason: {shop.statusNote}</p>}
      </div>
    </div>
  )
}

/** /seller/*: the seller's own area. Needs a signed-in customer with a shop; others go to /sell. */
export function SellerLayout() {
  const session = useSession((s) => s.session)
  const location = useLocation()
  const signedIn = !!session && session.user.role === 'CUSTOMER'
  const shop = useQuery({ queryKey: ['seller-shop'], queryFn: sellerApi.shop, enabled: signedIn, retry: false })

  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  if (!signedIn || (shop.error instanceof ApiError && shop.error.code === 'NO_SHOP')) return <Navigate to="/sell" replace />
  if (!shop.data) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        {shop.error ? <p className="text-sm text-destructive">{shop.error.message}</p> : <Loader2 className="size-6 animate-spin text-muted-foreground" />}
      </div>
    )
  }
  const s = shop.data

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex items-center gap-3">
        <ShopLogo shop={s} />
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-1.5 text-lg font-extrabold sm:text-xl">
            <span className="truncate">{s.name}</span>
            {s.verifiedAt && <VerifiedBadge compact />}
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            {KIND_LABEL[s.kind]}{s.area && ` · ${s.area}`} ·{' '}
            <span className={cn('font-semibold', s.status === 'APPROVED' ? 'text-success' : 'text-amber-ink')}>{SHOP_STATUS_LABEL[s.status]}</span>
          </p>
        </div>
        {s.status === 'APPROVED' ? (
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link to={`/shops/${s.slug}`}><ExternalLink /> <span className="hidden sm:inline">View my shop</span><span className="sm:hidden">Shop</span></Link>
          </Button>
        ) : (
          <Store className="size-5 text-muted-foreground" aria-hidden />
        )}
      </header>

      <StatusBanner shop={s} />

      <nav aria-label="Seller" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              cn(
                'flex h-10 shrink-0 items-center rounded-full border px-4 text-sm font-semibold transition-colors',
                isActive ? 'border-foreground bg-foreground text-background' : 'bg-card text-muted-foreground hover:text-foreground',
              )
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>

      <Outlet context={s} />
    </div>
  )
}
