import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeftRight,
  BarChart3,
  ExternalLink,
  FlaskConical,
  FolderTree,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Package,
  ShoppingBag,
  RotateCcw,
  Settings2,
  ShieldCheck,
  UserRound,
  Users,
  Webhook,
} from 'lucide-react'
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router'

import { Logo } from '@/components/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { adminApi, adminToken } from '@/lib/admin-api'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/orders', label: 'Orders', icon: Package },
  { to: '/admin/payments', label: 'Payments', icon: ArrowLeftRight },
  { to: '/admin/reports', label: 'Reports', icon: BarChart3 },
  { to: '/admin/products', label: 'Products', icon: ShoppingBag },
  { to: '/admin/categories', label: 'Categories', icon: FolderTree },
  { to: '/admin/webhooks', label: 'Webhooks', icon: Webhook },
  { to: '/admin/refunds', label: 'Refunds', icon: RotateCcw },
  { to: '/admin/emails', label: 'Emails', icon: Mail },
  { to: '/admin/setup', label: 'BillPay setup', icon: Settings2 },
  { to: '/admin/users', label: 'Users', icon: Users, adminOnly: true },
  { to: '/admin/login-history', label: 'Login history', icon: ShieldCheck, adminOnly: true },
  { to: '/admin/account', label: 'My account', icon: UserRound },
]

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const isAdmin = adminToken.session()?.user.role === 'ADMIN'
  return (
    <nav className="flex flex-col gap-1">
      {NAV.filter((n) => isAdmin || !n.adminOnly).map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
              isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )
          }
        >
          <n.icon className="size-4" />
          {n.label}
        </NavLink>
      ))}
    </nav>
  )
}

export function AdminLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const config = useQuery({ queryKey: ['admin-config'], queryFn: adminApi.config, enabled: !!adminToken.get() })

  const staff = adminToken.session()
  if (!adminToken.get()) {
    return <Navigate to={`/admin/login?next=${encodeURIComponent(location.pathname)}`} replace />
  }

  const logout = () => {
    adminToken.clear()
    navigate('/admin/login')
  }

  return (
    <div className="flex min-h-svh bg-muted/30">
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r bg-background p-4 lg:flex">
        <Logo />
        <p className="mt-1 pl-10 text-xs text-muted-foreground">Admin</p>
        <div className="mt-8 flex-1">
          <Nav />
        </div>
        <Button variant="ghost" className="justify-start" asChild>
          <a href="/" target="_blank" rel="noreferrer">
            <ExternalLink /> View store
          </a>
        </Button>
        <Button variant="ghost" className="justify-start" onClick={logout}>
          <LogOut /> Log out
        </Button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur sm:px-6">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-4">
              <SheetTitle className="sr-only">Admin menu</SheetTitle>
              <Logo />
              <div className="mt-8">
                <Nav />
              </div>
              <Button variant="ghost" className="mt-4 w-full justify-start" onClick={logout}>
                <LogOut /> Log out
              </Button>
            </SheetContent>
          </Sheet>
          {config.data && (
            <Badge
              variant="outline"
              className={cn('gap-1.5', config.data.sandbox ? 'border-warning/50 bg-warning/10' : 'border-success/50 bg-success/10')}
            >
              {config.data.sandbox ? <FlaskConical className="size-3" /> : <span className="size-1.5 rounded-full bg-success" />}
              {config.data.sandbox ? 'BillPay sandbox' : 'BillPay live'}
            </Badge>
          )}
          {config.data && !config.data.apiKeyConfigured && (
            <Badge variant="destructive">API key missing</Badge>
          )}
          <div className="ml-auto flex items-center gap-3">
            {staff && (
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium leading-tight">{staff.user.fullName}</p>
                <p className="text-xs text-muted-foreground">
                  {staff.user.email} · <span className={staff.user.role === 'ADMIN' ? 'text-brand' : ''}>{staff.user.role.toLowerCase()}</span>
                </p>
              </div>
            )}
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
