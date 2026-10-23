import { FlaskConical, Menu, ShoppingCart } from 'lucide-react'
import { Link, NavLink, Outlet, ScrollRestoration } from 'react-router'

import { CartSheet } from '@/components/cart-sheet'
import { Logo } from '@/components/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { cartTotals, useCart } from '@/store/cart'

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/shop', label: 'Shop' },
  { to: '/orders/track', label: 'Track order' },
]

function SandboxBanner() {
  return (
    <div className="flex items-center justify-center gap-2 bg-warning/15 px-4 py-1.5 text-center text-xs font-medium text-foreground">
      <FlaskConical className="size-3.5 shrink-0" />
      Sandbox mode: payments go through BillPay test. No real money moves.
    </div>
  )
}

function Header() {
  const lines = useCart((s) => s.lines)
  const setOpen = useCart((s) => s.setOpen)
  const { count } = cartTotals(lines)
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn('text-sm font-medium transition-colors hover:text-foreground', isActive ? 'text-foreground' : 'text-muted-foreground')

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-6 md:flex">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={linkClass}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <Button variant="ghost" size="icon" className="relative" aria-label="Open cart" onClick={() => setOpen(true)}>
            <ShoppingCart />
            {count > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold text-brand-foreground">
                {count}
              </span>
            )}
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-6">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <Logo />
              <nav className="mt-8 flex flex-col gap-4">
                {NAV.map((n) => (
                  <NavLink key={n.to} to={n.to} end={n.end} className={linkClass}>
                    {n.label}
                  </NavLink>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}

const YEAR = new Date().getFullYear()

function Footer() {
  return (
    <footer className="mt-24 border-t">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="space-y-3 md:col-span-2">
          <Logo />
          <p className="max-w-sm text-sm text-muted-foreground">
            Ethiopian-made goods and everyday essentials, delivered across Addis Ababa. Payments secured by BillPay.
          </p>
        </div>
        <div className="space-y-3 text-sm">
          <p className="font-medium">Shop</p>
          <ul className="space-y-2 text-muted-foreground">
            <li><Link to="/shop?category=coffee-tea" className="hover:text-foreground">Coffee & Tea</Link></li>
            <li><Link to="/shop?category=fashion" className="hover:text-foreground">Fashion</Link></li>
            <li><Link to="/shop?category=electronics" className="hover:text-foreground">Electronics</Link></li>
          </ul>
        </div>
        <div className="space-y-3 text-sm">
          <p className="font-medium">Help</p>
          <ul className="space-y-2 text-muted-foreground">
            <li><Link to="/orders/track" className="hover:text-foreground">Track your order</Link></li>
            <li><a href="/#faq" className="hover:text-foreground">FAQ</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t py-6 text-center text-xs text-muted-foreground">
        © {YEAR} TenaShop by TenaPay. A BillPay integration test store.
      </div>
    </footer>
  )
}

export function SiteLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <SandboxBanner />
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <CartSheet />
      <ScrollRestoration />
    </div>
  )
}
