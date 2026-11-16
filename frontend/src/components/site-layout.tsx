import { useQuery } from '@tanstack/react-query'
import {
  BriefcaseBusiness,
  ChevronRight,
  FlaskConical,
  Heart,
  Home,
  LayoutGrid,
  Menu,
  Package,
  Plus,
  Send,
  ShoppingCart,
  Store,
  Truck,
  User,
  Wrench,
} from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router'

import { CartSheet } from '@/components/cart-sheet'
import { CategoryMegaMenu } from '@/components/category-menu'
import { ChatsNavLink } from '@/components/chat-nav'
import { InboxBell } from '@/components/inbox-bell'
import { InstallApp } from '@/components/install-app'
import { LanguageSwitch, LanguageSync } from '@/components/language-switch'
import { Logo } from '@/components/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { UserMenu } from '@/components/user-menu'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { api } from '@/lib/api'
import { useFeatures } from '@/lib/features'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { cartTotals, useCart } from '@/store/cart'
import { useSession } from '@/store/session'

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
      variant="ghost"
      size="icon"
      className={cn('relative size-11 rounded-full', className)}
      aria-label={count > 0 ? t('Open cart, {n} items', { n: count }) : t('Open cart')}
      onClick={() => setOpen(true)}
    >
      <ShoppingCart className="size-5" />
      {count > 0 && (
        <span className="absolute right-0.5 top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-market px-1 text-[11px] font-bold text-white">
          {count}
        </span>
      )}
    </Button>
  )
}

/** Desktop links after "Marketplace" (which opens the category menu). */
const NAV = [
  { to: '/services', label: 'Services' },
  { to: '/work', label: 'Jobs' },
  { to: '/chats', label: 'Chats' },
  { to: '/sell', label: 'Sell' },
]

/** Desktop link with the green underline when active. */
const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'relative py-2 text-sm font-semibold transition-colors hover:text-primary',
    'after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-primary after:transition after:content-[""]',
    isActive ? 'text-primary after:opacity-100' : 'text-foreground/80 after:opacity-0',
  )

function Header() {
  const t = useT()
  const { payments } = useFeatures()
  const { pathname } = useLocation()
  const inMarketplace = pathname.startsWith('/shop') || pathname.startsWith('/categories') || pathname.startsWith('/product')
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-lg print:hidden">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:h-[4.5rem]">
        <Logo withPlace />
        <nav aria-label="Main" className="mx-auto hidden items-center gap-7 md:flex">
          <NavLink to="/" end className={navClass}>{t('Home')}</NavLink>
          <CategoryMegaMenu
            label="Marketplace"
            triggerClassName={cn('h-9 px-0 text-sm hover:bg-transparent hover:text-primary', inMarketplace ? 'text-primary' : 'text-foreground/80')}
          />
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={navClass}>{t(n.label)}</NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1 md:ml-0 md:gap-2">
          <div className="hidden md:block"><LanguageSwitch /></div>
          <div className="hidden lg:block"><ThemeToggle /></div>
          <InboxBell />
          {payments && <CartButton />}
          <div className="hidden md:block"><UserMenu /></div>
          <MobileMenu />
        </div>
      </div>
    </header>
  )
}

/** Phones: the menu behind ☰, with what the bottom bar has no room for. */
function MobileMenu() {
  const t = useT()
  const { payments } = useFeatures()
  const session = useSession((s) => s.session)
  const [open, setOpen] = useState(false)
  const links = [
    { to: '/shop', label: 'Marketplace', icon: Store },
    { to: '/categories', label: 'All categories', icon: LayoutGrid },
    { to: '/services', label: 'Services', icon: Wrench },
    { to: '/work', label: 'Jobs', icon: BriefcaseBusiness },
    { to: '/favourites', label: 'Favourites', icon: Heart },
    ...(payments ? [{ to: '/orders/track', label: 'Track order', icon: Truck }] : []),
    ...(session ? [{ to: '/account', label: 'My orders', icon: Package }] : []),
  ]
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="size-11 md:hidden" aria-label={t('Menu')}>
          <Menu className="size-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[86vw] max-w-sm">
        <SheetHeader className="px-5 text-left">
          <SheetTitle><Logo /></SheetTitle>
          <SheetDescription>{t('Buy. Sell. Grow Together.')}</SheetDescription>
        </SheetHeader>
        <div className="flex items-center gap-2 px-5">
          {!session && (
            <Button asChild className="h-10 flex-1 rounded-full font-semibold">
              <Link to="/login" onClick={() => setOpen(false)}><User /> {t('Sign in')}</Link>
            </Button>
          )}
          <LanguageSwitch />
          <ThemeToggle />
        </div>
        <nav className="grid gap-1 px-3">
          {links.map((l) => (
            <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="flex min-h-12 items-center gap-3 rounded-xl px-3 font-semibold hover:bg-accent">
              <l.icon className="size-5 text-primary" /> {t(l.label)}
              <ChevronRight className="ml-auto size-4 text-muted-foreground" />
            </Link>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  )
}

/** Phone bottom bar, as in the design: Home, Marketplace, Sell (the raised green button), Chats, Account. */
function BottomNav() {
  const t = useT()
  const { pathname } = useLocation()
  const item = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex min-h-11 min-w-14 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors',
      isActive ? 'font-bold text-primary' : 'font-semibold text-muted-foreground',
    )
  const selling = pathname === '/sell' || pathname.startsWith('/seller')
  const shopping = pathname.startsWith('/shop') || pathname.startsWith('/categories') || pathname.startsWith('/product')
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-end justify-around border-t bg-card px-1 pb-[calc(0.35rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_-16px_rgba(0,0,0,0.25)] md:hidden print:hidden"
    >
      <NavLink to="/" end className={item}>
        <Home className="size-[22px]" /> {t('Home')}
      </NavLink>
      <NavLink to="/shop" className={() => item({ isActive: shopping })}>
        <Store className="size-[22px]" /> {t('Marketplace')}
      </NavLink>
      <Link to="/sell" className="flex flex-col items-center gap-0.5 text-[11px] font-bold" aria-current={selling ? 'page' : undefined}>
        <span className={cn('-mt-6 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/40 ring-4 ring-card transition active:scale-95', selling && 'bg-market')}>
          <Plus className="size-7" strokeWidth={2.5} />
        </span>
        <span className={selling ? 'text-primary' : 'text-muted-foreground'}>{t('Sell')}</span>
      </Link>
      <ChatsNavLink className={item} />
      <NavLink to="/account" className={item}>
        <User className="size-[22px]" /> {t('Account')}
      </NavLink>
    </nav>
  )
}

const YEAR = new Date().getFullYear()

/** Dark green footer with the hills of Sodo along the bottom. */
function Footer() {
  const t = useT()
  const { payments } = useFeatures()
  const quick = [
    { to: '/', label: 'Home' },
    { to: '/shop', label: 'Marketplace' },
    { to: '/services', label: 'Services' },
    { to: '/work', label: 'Jobs' },
    { to: '/sell', label: 'Sell on Sodo Gebeya' },
  ]
  const help = [
    { to: '/#faq', label: 'Questions' },
    ...(payments ? [{ to: '/orders/track', label: 'Track your order' }] : []),
    { to: '/categories', label: 'All categories' },
    { to: '/work/cv', label: 'Professional CV' },
  ]
  return (
    <footer className="relative isolate mt-12 overflow-hidden bg-[#0E5A43] pb-20 text-white md:pb-0 print:hidden">
      <svg viewBox="0 0 1440 160" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 -z-10 h-32 w-full opacity-30" aria-hidden>
        <path d="M0 110 C200 60 340 120 520 80 S860 40 1040 90 S1300 70 1440 100 V160 H0Z" fill="#0B4A37" />
        <path d="M0 135 C240 100 420 150 640 120 S1000 100 1200 130 S1380 120 1440 128 V160 H0Z" fill="#093C2D" />
        {[120, 160, 300, 900, 960, 1220].map((x, i) => (
          <path key={x} d={`M${x} ${118 - (i % 2) * 8} l14 -34 l14 34Z`} fill="#0B4A37" />
        ))}
      </svg>
      <InstallApp className="mx-4 mt-8 sm:mx-auto sm:max-w-xl" />
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.3fr_1fr_1fr_1.3fr]">
        <div className="space-y-3">
          <Logo onDark />
          <p className="text-sm font-semibold text-[#F2C77E]">{t('Buy. Sell. Grow Together.')}</p>
          <p className="max-w-xs text-sm text-white/70">
            {payments
              ? t('The online market for Wolaita Sodo: buy from local shops and people, pay with BillPay, get it delivered in town.')
              : t('The online market for Wolaita Sodo: buy and sell with local shops and people, find work, and hire skilled workers.')}
          </p>
        </div>
        <FooterLinks title={t('Quick Links')} links={quick} />
        <FooterLinks title={t('Help')} links={help} />
        <div className="space-y-3 text-sm">
          <p className="font-bold">{t('Stay Connected')}</p>
          <p className="text-white/70">{t('Get new listings, chats and order updates on Telegram.')}</p>
          <Button asChild className="h-11 rounded-full bg-white px-5 font-semibold text-[#0E5A43] hover:bg-white/90">
            <Link to="/notifications"><Send /> {t('Connect Telegram')}</Link>
          </Button>
        </div>
      </div>
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 border-t border-white/10 px-4 py-5 text-xs text-white/60 sm:flex-row sm:px-6">
        <span>© {YEAR} {t('Sodo Gebeya. All rights reserved.')}{payments && ` · ${t('Payments by BillPay')}`}</span>
        <span className="flex items-center gap-1">{t('Made with')} <Heart className="size-3.5 fill-market text-market" /> {t('for Wolaita Sodo')}</span>
      </div>
    </footer>
  )
}

function FooterLinks({ title, links }: { title: string; links: { to: string; label: string }[] }) {
  const t = useT()
  return (
    <div className="space-y-3 text-sm">
      <p className="font-bold">{title}</p>
      <ul className="space-y-2 text-white/70">
        {links.map((l) => (
          <li key={l.to}>
            {l.to.startsWith('/#') ? (
              <a href={l.to} className="hover:text-white">{t(l.label)}</a>
            ) : (
              <Link to={l.to} className="hover:text-white">{t(l.label)}</Link>
            )}
          </li>
        ))}
      </ul>
    </div>
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
