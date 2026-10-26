import { useQuery } from '@tanstack/react-query'
import {
  Bike,
  ArrowLeftRight,
  BarChart3,
  Gauge,
  ExternalLink,
  FlaskConical,
  Flag,
  BadgeCheck,
  MapPin,
  MessageSquareWarning,
  FolderTree,
  LayoutDashboard,
  LogOut,
  Mail,
  MessageSquareText,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Store,
  TicketPercent,
  Wallet,
  ToggleRight,
  Percent,
  UserRound,
  Users,
  Webhook,
  Wrench,
  Star,
  BriefcaseBusiness,
  AlertTriangle,
  Rocket,
  GalleryHorizontal,
  FileText,
  GraduationCap,
} from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router'

import { LogoMark } from '@/components/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { adminApi, adminToken, payoutAdminApi, shopAdminApi } from '@/lib/admin-api'
import { trustAdminApi } from '@/lib/trust-api'
import { workAdminApi } from '@/lib/work-admin-api'
import { problemAdminApi } from '@/lib/dispute-api'
import { promoAdminApi } from '@/lib/promo-api'
import { cn } from '@/lib/utils'

type Item = { to: string; label: string; icon: typeof Package; end?: boolean; adminOnly?: boolean; badge?: 'review' | 'webhooks' | 'sellers' | 'verifications' | 'listings' | 'payouts' | 'jobs' | 'cv' | 'students' | 'problems' | 'promo' }

const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: 'Overview',
    items: [
      { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/admin/reports', label: 'Reports', icon: BarChart3 },
      { to: '/admin/features', label: 'Features', icon: ToggleRight },
    ],
  },
  {
    label: 'Sales',
    items: [
      { to: '/admin/orders', label: 'Orders', icon: Package, badge: 'review' },
      { to: '/admin/payments', label: 'Payments', icon: ArrowLeftRight },
      { to: '/admin/refunds', label: 'Refunds', icon: RotateCcw },
      { to: '/admin/problems', label: 'Problems', icon: AlertTriangle, badge: 'problems' },
      { to: '/admin/discounts', label: 'Discounts', icon: TicketPercent },
      { to: '/admin/payouts', label: 'Payouts', icon: Wallet, badge: 'payouts' },
      { to: '/admin/fees', label: 'Fees', icon: Percent },
      { to: '/admin/promo', label: 'Boosts & plans', icon: Rocket, badge: 'promo' },
      { to: '/admin/banners', label: 'Banners', icon: GalleryHorizontal },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { to: '/admin/products', label: 'Products', icon: ShoppingBag },
      { to: '/admin/categories', label: 'Categories', icon: FolderTree },
      { to: '/admin/areas', label: 'Areas', icon: MapPin },
      { to: '/admin/riders', label: 'Riders', icon: Bike },
    ],
  },
  {
    label: 'Marketplace',
    items: [
      { to: '/admin/shops', label: 'Sellers', icon: Store, badge: 'sellers' },
      { to: '/admin/pros', label: 'Pros', icon: Wrench },
      { to: '/admin/verifications', label: 'Verifications', icon: BadgeCheck, badge: 'verifications' },
      { to: '/admin/listing-reports', label: 'Listing reports', icon: Flag, badge: 'listings' },
      { to: '/admin/chat-reports', label: 'Chat reports', icon: MessageSquareWarning },
      { to: '/admin/reviews', label: 'Reviews', icon: Star },
    ],
  },
  {
    label: 'Jobs & CVs',
    items: [
      { to: '/admin/jobs', label: 'Job posts', icon: BriefcaseBusiness, badge: 'jobs' },
      { to: '/admin/cv-orders', label: 'CV orders', icon: FileText, badge: 'cv' },
      { to: '/admin/students', label: 'Students', icon: GraduationCap, badge: 'students' },
    ],
  },
  {
    label: 'Integration',
    items: [
      { to: '/admin/setup', label: 'BillPay setup', icon: Settings2 },
      { to: '/admin/webhooks', label: 'Webhooks', icon: Webhook, badge: 'webhooks' },
      { to: '/admin/emails', label: 'Emails', icon: Mail },
      { to: '/admin/sms', label: 'SMS', icon: MessageSquareText },
      { to: '/admin/load-tests', label: 'Load tests', icon: Gauge, adminOnly: true },
    ],
  },
  {
    label: 'Admin',
    items: [
      { to: '/admin/users', label: 'Users', icon: Users, adminOnly: true },
      { to: '/admin/login-history', label: 'Login history', icon: ShieldCheck, adminOnly: true },
    ],
  },
]

const COLLAPSE_KEY = 'tenashop-admin-sidebar'

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === 'collapsed'
  } catch {
    return false
  }
}

function Nav({ collapsed = false, counts, onNavigate }: { collapsed?: boolean; counts: Record<string, number>; onNavigate?: () => void }) {
  const isAdmin = adminToken.session()?.user.role === 'ADMIN'
  return (
    <nav className="flex flex-col gap-2">
      {GROUPS.map((g) => {
        const items = g.items.filter((n) => isAdmin || !n.adminOnly)
        if (items.length === 0) return null
        return (
          <div key={g.label} className="flex flex-col gap-0.5">
            {collapsed ? (
              <div className="mx-auto my-1 h-px w-6 bg-border" aria-hidden />
            ) : (
              <p className="px-2.5 pb-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">{g.label}</p>
            )}
            {items.map((n) => {
              const count = n.badge ? counts[n.badge] ?? 0 : 0
              return (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  onClick={onNavigate}
                  title={collapsed ? n.label : undefined}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex h-[30px] items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors',
                      collapsed && 'justify-center px-0',
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )
                  }
                >
                  <n.icon className="size-4 shrink-0" />
                  {!collapsed && <span className="truncate">{n.label}</span>}
                  {count > 0 &&
                    (collapsed ? (
                      <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-warning" aria-label={`${count} need attention`} />
                    ) : (
                      <span className="ml-auto rounded-full bg-warning/20 px-1.5 text-[11px] font-semibold tabular-nums text-foreground">
                        {count}
                      </span>
                    ))}
                </NavLink>
              )
            })}
          </div>
        )
      })}
    </nav>
  )
}

function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link to="/admin" className={cn('flex items-center gap-2 font-semibold tracking-tight', collapsed && 'justify-center')}>
      <LogoMark className="h-7" />
      {!collapsed && (
        <span className="leading-tight font-extrabold">
          Sodo <span className="text-brand">Gebeya</span>
          <span className="block text-[11px] font-normal text-muted-foreground">Admin</span>
        </span>
      )}
    </Link>
  )
}

/** Jump straight to an order (or any order search) from every admin page. */
function OrderSearch() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  return (
    <form
      className="relative hidden w-64 md:block lg:w-80"
      onSubmit={(e) => {
        e.preventDefault()
        if (q.trim()) navigate(`/admin/orders?q=${encodeURIComponent(q.trim())}`)
      }}
    >
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Find order, customer or phone…"
        aria-label="Find order"
        className="h-8 w-full rounded-md border bg-muted/40 pl-8 pr-3 text-sm outline-none transition focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/30"
      />
    </form>
  )
}

export function AdminLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [menuOpen, setMenuOpen] = useState(false)
  const signedIn = !!adminToken.get()
  const config = useQuery({ queryKey: ['admin-config'], queryFn: adminApi.config, enabled: signedIn })
  const dashboard = useQuery({ queryKey: ['admin-dashboard'], queryFn: () => adminApi.dashboard(), enabled: signedIn, refetchInterval: 30_000 })
  const trustQueue = useQuery({
    queryKey: ['admin-trust-badges'],
    queryFn: async () => {
      const [v, r, p] = await Promise.all([trustAdminApi.verifications('SUBMITTED'), trustAdminApi.reports('OPEN'), payoutAdminApi.list('REQUESTED')])
      return { verifications: v.counts.SUBMITTED ?? 0, listings: r.open, payouts: p.totals.requestedCount }
    },
    enabled: signedIn,
    refetchInterval: 60_000,
  })
  const shopQueue = useQuery({
    queryKey: ['admin-shops', 'badge'],
    queryFn: () => shopAdminApi.list({ status: 'PENDING' }),
    enabled: signedIn,
    refetchInterval: 60_000,
  })

  const workQueue = useQuery({ queryKey: ['admin-work-counts'], queryFn: workAdminApi.counts, enabled: signedIn, refetchInterval: 60_000 })
  const problemQueue = useQuery({ queryKey: ['admin-problem-count'], queryFn: problemAdminApi.count, enabled: signedIn, refetchInterval: 60_000 })
  const promoQueue = useQuery({ queryKey: ['admin-promo-counts'], queryFn: promoAdminApi.counts, enabled: signedIn, refetchInterval: 60_000 })

  const staff = adminToken.session()
  if (!signedIn) {
    return <Navigate to={`/admin/login?next=${encodeURIComponent(location.pathname)}`} replace />
  }

  const counts = {
    review: dashboard.data?.ordersByStatus.REVIEW_REQUIRED ?? 0,
    webhooks: dashboard.data?.webhooksAwaitingProcessing ?? 0,
    sellers: shopQueue.data?.counts.PENDING ?? 0,
    verifications: trustQueue.data?.verifications ?? 0,
    listings: trustQueue.data?.listings ?? 0,
    payouts: trustQueue.data?.payouts ?? 0,
    jobs: workQueue.data?.jobsPending ?? 0,
    cv: workQueue.data?.cvOrdersOpen ?? 0,
    students: workQueue.data?.studentsWaiting ?? 0,
    problems: problemQueue.data?.open ?? 0,
    promo: (promoQueue.data?.boosts ?? 0) + (promoQueue.data?.plans ?? 0),
  }

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? 'expanded' : 'collapsed')
      } catch {
        // private mode: just don't remember
      }
      return !c
    })
  }

  const logout = () => {
    adminToken.clear()
    navigate('/admin/login')
  }

  return (
    <div className="flex min-h-svh bg-muted/30">
      <aside
        className={cn(
          'sticky top-0 hidden h-svh shrink-0 flex-col border-r bg-background py-3 transition-[width] duration-200 lg:flex',
          collapsed ? 'w-[60px] px-2' : 'w-52 px-3',
        )}
      >
        <div className={cn('flex h-9 items-center', collapsed ? 'justify-center' : 'justify-between pl-1')}>
          <Brand collapsed={collapsed} />
        </div>
        <div className="mt-3 flex-1 overflow-y-auto overflow-x-hidden">
          <Nav collapsed={collapsed} counts={counts} />
        </div>
        <div className="mt-2 flex flex-col gap-0.5 border-t pt-2">
          <NavLink
            to="/admin/account"
            title={collapsed ? 'My account' : undefined}
            className={({ isActive }) =>
              cn(
                'flex h-[30px] items-center gap-2.5 rounded-md px-2.5 text-[13px]',
                collapsed && 'justify-center px-0',
                isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )
            }
          >
            <UserRound className="size-4" /> {!collapsed && 'My account'}
          </NavLink>
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            title={collapsed ? 'View store' : undefined}
            className={cn(
              'flex h-[30px] items-center gap-2.5 rounded-md px-2.5 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground',
              collapsed && 'justify-center px-0',
            )}
          >
            <ExternalLink className="size-4" /> {!collapsed && 'View store'}
          </a>
          <button
            type="button"
            onClick={toggle}
            title={collapsed ? 'Expand menu' : undefined}
            className={cn(
              'flex h-[30px] items-center gap-2.5 rounded-md px-2.5 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground',
              collapsed && 'justify-center px-0',
            )}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            {!collapsed && 'Collapse'}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur sm:px-4 lg:px-5">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-60 p-3">
              <SheetTitle className="sr-only">Admin menu</SheetTitle>
              <div className="pl-1">
                <Brand />
              </div>
              <div className="mt-4">
                <Nav counts={counts} onNavigate={() => setMenuOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
          {config.data && (
            <Link to="/admin/setup" title="Payment mode: switch in BillPay setup">
              <span
                className={cn(
                  'inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium',
                  config.data.sandbox ? 'border-warning/50 bg-warning/10' : 'border-success/50 bg-success/10',
                )}
              >
                {config.data.sandbox ? (
                  <FlaskConical className="size-3" />
                ) : (
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-success" />
                  </span>
                )}
                {config.data.sandbox ? 'Sandbox' : 'Live'}
              </span>
            </Link>
          )}
          {config.data && !config.data.apiKeyConfigured && (
            <span className="rounded-full bg-destructive px-2 py-0.5 text-xs font-medium text-white">API key missing</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <OrderSearch />
            {staff && (
              <div className="hidden text-right leading-tight xl:block">
                <p className="text-[13px] font-medium">{staff.user.fullName}</p>
                <p className="text-[11px] text-muted-foreground">
                  {staff.user.email} · <span className={staff.user.role === 'ADMIN' ? 'text-brand' : ''}>{staff.user.role.toLowerCase()}</span>
                </p>
              </div>
            )}
            <ThemeToggle />
            <Button variant="ghost" size="icon-sm" onClick={logout} aria-label="Log out" title="Log out">
              <LogOut />
            </Button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1680px] flex-1 space-y-4 px-3 py-4 sm:px-4 lg:px-5">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
