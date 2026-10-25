import { useQuery } from '@tanstack/react-query'
import { FlaskConical, Home, Search, ShoppingCart, Store, User, Wrench } from 'lucide-react'
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router'

import { CartSheet } from '@/components/cart-sheet'
import { ChatsNavLink } from '@/components/chat-nav'
import { InboxBell } from '@/components/inbox-bell'
import { InstallApp } from '@/components/install-app'
import { LanguageSwitch, LanguageSync } from '@/components/language-switch'
import { Logo } from '@/components/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { UserMenu } from '@/components/user-menu'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { useFeatures } from '@/lib/features'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { cartTotals, useCart } from '@/store/cart'

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/shop', label: 'Shop' },
  { to: '/services', label: 'Services' },
  { to: '/work', label: 'Jobs' },
  { to: '/orders/track', label: 'Track order' },
  { to: '/chats', label: 'Chats' },
  { to: '/sell', label: 'Sell' },
]

/** Shown only while payments go to BillPay's sandbox; with live keys real money moves, so it must not claim otherwise. */
function SandboxBanner() {
  const info = useQuery({ queryKey: ['store-info'], queryFn: api.storeInfo, staleTime: 5 * 60_000 })
  const t = useT()
  const { payments } = useFeatures()
  // only matters while buyers can pay online
  if (!payments || !info.data?.sandbox) return null
  return (
    <div className="flex items-center justify-center gap-2 bg-warning/20 px-4 py-1.5 text-center text-xs font-medium text-foreground">
      <FlaskConical className="size-3.5 shrink-0" />
      {t("Test mode: payments go through BillPay's sandbox. No real money moves.")}
    </div>
  )
}

function CartButton({ className }: { className?: string }) {
  const t = useT()
  const lines = useCart((s) => s.lines)
  const setOpen = useCart((s) => s.setOpen)
  const { count } = cartTotals(lines)
  return (
    <Button
      variant="outline"
      size="icon"
      className={cn('relative size-11 rounded-full bg-card', className)}
      aria-label={count > 0 ? t('Open cart, {n} items', { n: count }) : t('Open cart')}
      onClick={() => setOpen(true)}
    >
      <ShoppingCart className="size-5" />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
          {count}
        </span>
      )}
    </Button>
  )
}

function Header() {
  const t = useT()
  const { payments } = useFeatures()
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn('text-sm font-semibold transition-colors hover:text-foreground', isActive ? 'text-foreground' : 'text-muted-foreground')

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-lg print:hidden">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Logo withPlace />
        <nav aria-label="Main" className="hidden items-center gap-6 md:flex">
          {NAV.filter((n) => payments || n.to !== '/orders/track').map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={linkClass}>
              {t(n.label)}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" className="size-11 md:hidden" aria-label={t('Search')}>
            <Link to="/shop">
              <Search className="size-5" />
            </Link>
          </Button>
          <LanguageSwitch />
          <InboxBell />
          <div className="hidden md:block">
            <ThemeToggle />
          </div>
          <div className="hidden md:block">
            <UserMenu />
          </div>
          {payments && <CartButton />}
        </div>
      </div>
    </header>
  )
}

/** "Sell" opens the seller area (/seller/*) too, so it stays highlighted there. */
function SellLink({ className }: { className: (s: { isActive: boolean }) => string }) {
  const t = useT()
  const { pathname } = useLocation()
  const active = pathname === '/sell' || pathname.startsWith('/seller')
  return (
    <Link to="/sell" className={className({ isActive: active })} aria-current={active ? 'page' : undefined}>
      <Store className="size-[22px]" /> {t('Sell')}
    </Link>
  )
}

/** Phone navigation, as in the design (S1): Home, Services, Sell, Chats, Account. Shop is reached from search and Home,
 *  orders from Account. */
function BottomNav() {
  const t = useT()
  const item = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex min-h-11 min-w-16 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors',
      isActive ? 'font-bold text-primary' : 'font-semibold text-muted-foreground',
    )
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden print:hidden"
    >
      <NavLink to="/" end className={item}>
        <Home className="size-[22px]" /> {t('Home')}
      </NavLink>
      <NavLink to="/services" className={item}>
        <Wrench className="size-[22px]" /> {t('Services')}
      </NavLink>
      <SellLink className={item} />
      <ChatsNavLink className={item} />
      <NavLink to="/account" className={item}>
        <User className="size-[22px]" /> {t('Account')}
      </NavLink>
    </nav>
  )
}

const YEAR = new Date().getFullYear()

function Footer() {
  const t = useT()
  const { payments } = useFeatures()
  return (
    <footer className="mt-20 border-t bg-card pb-20 md:pb-0 print:hidden">
      {/* installable app (shown only when the browser offers it) */}
      <InstallApp className="mx-4 mt-8 sm:mx-auto sm:max-w-xl" />
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="space-y-3 md:col-span-2">
          <Logo withPlace />
          <p className="max-w-sm text-sm text-muted-foreground">
            {payments
              ? t('The online market for Wolaita Sodo: buy from local shops and people, pay with BillPay, get it delivered in town.')
              : t('The online market for Wolaita Sodo: buy and sell with local shops and people, find work, and hire skilled workers.')}
          </p>
        </div>
        <div className="space-y-3 text-sm">
          <p className="font-semibold">{t('Shop')}</p>
          <ul className="space-y-2 text-muted-foreground">
            <li><Link to="/shop" className="hover:text-foreground">{t('All products')}</Link></li>
            <li><Link to="/shop?sort=newest" className="hover:text-foreground">{t('New arrivals')}</Link></li>
            <li><Link to="/work" className="hover:text-foreground">{t('Jobs in Sodo')}</Link></li>
            <li><Link to="/work/cv" className="hover:text-foreground">{t('Professional CV')}</Link></li>
          </ul>
        </div>
        <div className="space-y-3 text-sm">
          <p className="font-semibold">{t('Help')}</p>
          <ul className="space-y-2 text-muted-foreground">
            <li><Link to="/orders/track" className="hover:text-foreground">{t('Track your order')}</Link></li>
            <li><a href="/#faq" className="hover:text-foreground">{t('Questions')}</a></li>
            <li><Link to="/sell" className="hover:text-foreground">{t('Sell on Sodo Gebeya')}</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t py-6 text-center text-xs text-muted-foreground">
        © {YEAR} {t('Sodo Gebeya · Wolaita Sodo, Ethiopia')}{payments && ` · ${t('Payments by BillPay')}`}
      </div>
    </footer>
  )
}

export function SiteLayout() {
  const { payments } = useFeatures()
  return (
    <div className="flex min-h-svh flex-col">
      <div className="print:hidden"><SandboxBanner /></div>
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <BottomNav />
      {payments && <CartSheet />}
      <LanguageSync />
      <ScrollRestoration />
    </div>
  )
}
