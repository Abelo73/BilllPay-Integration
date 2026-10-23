import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, KeyRound, Loader2, LogOut, Package, ShieldAlert, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/lib/api'
import { formatDate, formatETB } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useSession } from '@/store/session'

const STATUS_TONE: Record<string, string> = {
  PAID: 'bg-success/15 text-success border-success/30',
  PENDING_PAYMENT: 'bg-brand/10 text-brand border-brand/30',
  PAYMENT_FAILED: 'bg-destructive/10 text-destructive border-destructive/30',
  REVIEW_REQUIRED: 'bg-warning/15 border-warning/40',
}

function MyOrders() {
  const [page, setPage] = useState(0)
  const { data, isLoading } = useQuery({ queryKey: ['my-orders', page], queryFn: () => api.myOrders(page), placeholderData: keepPreviousData })
  if (isLoading) return <p className="py-10 text-center text-sm text-muted-foreground">Loading your orders…</p>
  if (!data || data.content.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed py-14 text-center">
        <Package className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No orders yet. Orders you place while signed in show up here.</p>
        <Button asChild>
          <Link to="/shop">Start shopping</Link>
        </Button>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {data.content.map((o) => (
        <Link
          key={o.orderNumber}
          to={`/orders/track?order=${o.orderNumber}`}
          className="flex items-center gap-4 rounded-xl border bg-card p-4 transition hover:border-brand/50 hover:shadow-sm"
        >
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
            <Package className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-sm font-medium">{o.orderNumber}</p>
            <p className="text-xs text-muted-foreground">
              {formatDate(o.createdAt)} · {o.itemCount} item{o.itemCount === 1 ? '' : 's'}
            </p>
          </div>
          <Badge variant="outline" className={cn('hidden sm:inline-flex', STATUS_TONE[o.status])}>
            {o.status.replaceAll('_', ' ').toLowerCase()}
          </Badge>
          <span className="font-semibold tabular-nums">{formatETB(o.total)}</span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </Link>
      ))}
      {data.totalPages > 1 && (
        <div className="flex justify-center gap-2 pt-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
          <Button variant="outline" size="sm" disabled={page + 1 >= data.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  )
}

function Profile() {
  const { session, setUser } = useSession()
  const user = session!.user
  const [form, setForm] = useState({ fullName: user.fullName, phone: user.phone ?? '' })
  const save = useMutation({
    mutationFn: () => api.updateMe(form),
    onSuccess: (u) => {
      setUser(u)
      toast.success('Profile saved')
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><UserRound className="size-4" /> Profile</CardTitle>
        <CardDescription>Used to prefill checkout. Your email is {user.email}.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" className="h-10" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" className="h-10" type="tel" placeholder="0911 234 567" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={save.isPending}>{save.isPending && <Loader2 className="animate-spin" />} Save</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function Security() {
  const { setSession, clear } = useSession()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [error, setError] = useState('')
  const change = useMutation({
    mutationFn: () => api.changePassword(pw.current, pw.next),
    onSuccess: (s) => {
      setSession(s)
      setPw({ current: '', next: '', confirm: '' })
      toast.success('Password changed. Other devices have been signed out.')
    },
    onError: (e) => setError(e.message),
  })
  const everywhere = useMutation({
    mutationFn: api.logoutEverywhere,
    onSuccess: () => {
      clear()
      qc.clear()
      toast.success('Signed out on every device')
      navigate('/login')
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="size-4" /> Change password</CardTitle>
          <CardDescription>Changing it signs you out on your other devices.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              setError('')
              if (pw.next !== pw.confirm) return setError('New passwords don’t match.')
              change.mutate()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="current">Current password</Label>
              <Input id="current" type="password" autoComplete="current-password" className="h-10" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="next">New password</Label>
              <Input id="next" type="password" autoComplete="new-password" className="h-10" required value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
              <p className="text-xs text-muted-foreground">At least 8 characters, with a letter and a number.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input id="confirm" type="password" autoComplete="new-password" className="h-10" required value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={change.isPending}>{change.isPending && <Loader2 className="animate-spin" />} Change password</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><ShieldAlert className="size-4" /> Sessions</CardTitle>
          <CardDescription>Lost a phone or signed in on a shared computer? End every session at once.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => everywhere.mutate()} disabled={everywhere.isPending}>
            {everywhere.isPending ? <Loader2 className="animate-spin" /> : <LogOut />} Sign out everywhere
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export function AccountPage() {
  const session = useSession((s) => s.session)
  const [params, setParams] = useSearchParams()
  if (!session) return <Navigate to="/login?next=/account" replace />
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-12 sm:px-6">
      <div className="flex items-center gap-4">
        <span className="grid size-14 place-items-center rounded-full bg-primary text-xl font-semibold text-primary-foreground">
          {session.user.fullName[0]?.toUpperCase()}
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hi, {session.user.fullName.split(' ')[0]}</h1>
          <p className="text-sm text-muted-foreground">{session.user.email}</p>
        </div>
      </div>
      <Tabs value={params.get('tab') ?? 'orders'} onValueChange={(tab) => setParams(tab === 'orders' ? {} : { tab }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="orders">My orders</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>
        <TabsContent value="orders" className="pt-4"><MyOrders /></TabsContent>
        <TabsContent value="profile" className="pt-4"><Profile /></TabsContent>
        <TabsContent value="security" className="pt-4"><Security /></TabsContent>
      </Tabs>
    </div>
  )
}
