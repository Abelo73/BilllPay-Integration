import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, KeyRound, Loader2, LogOut, MapPin, Package, Plus, ShieldAlert, Store, Trash2, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { ToReview } from '@/components/reviews'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api, type Address, type AddressInput } from '@/lib/api'
import { formatDate, formatETB } from '@/lib/format'
import { cn } from '@/lib/utils'
import { userContact, useSession } from '@/store/session'

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
              {(o.status === 'PENDING_PAYMENT' || o.status === 'PAYMENT_FAILED') && (
                <span className="font-medium text-brand"> · Not paid yet, open to finish paying</span>
              )}
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

const EMPTY_ADDRESS: AddressInput = { label: '', recipientName: '', phone: '', addressLine: '', city: 'Wolaita Sodo', notes: '' }

function Addresses() {
  const qc = useQueryClient()
  const user = useSession((s) => s.session!.user)
  const { data, isLoading } = useQuery({ queryKey: ['addresses'], queryFn: api.addresses })
  const [editing, setEditing] = useState<{ id: number | null; form: AddressInput } | null>(null)
  const done = (list: Address[], msg: string) => {
    qc.setQueryData(['addresses'], list)
    setEditing(null)
    toast.success(msg)
  }
  const save = useMutation({
    mutationFn: ({ id, form }: { id: number | null; form: AddressInput }) => (id ? api.updateAddress(id, form) : api.addAddress(form)),
    onSuccess: (list, v) => done(list, v.id ? 'Address updated' : 'Address saved'),
    onError: (e) => toast.error(e.message),
  })
  const remove = useMutation({
    mutationFn: api.deleteAddress,
    onSuccess: (list) => done(list, 'Address removed'),
    onError: (e) => toast.error(e.message),
  })
  const makeDefault = useMutation({
    mutationFn: (a: Address) => api.updateAddress(a.id, { ...toInput(a), makeDefault: true }),
    onSuccess: (list) => done(list, 'Default address changed'),
    onError: (e) => toast.error(e.message),
  })

  if (isLoading) return <p className="py-10 text-center text-sm text-muted-foreground">Loading addresses…</p>
  const list = data ?? []
  const f = editing?.form
  const set = (k: keyof AddressInput, v: string) => editing && setEditing({ ...editing, form: { ...editing.form, [k]: v } })

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {list.map((a) => (
          <Card key={a.id} className={cn(a.isDefault && 'border-brand/50')}>
            <CardContent className="space-y-3 pt-6">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 font-medium"><MapPin className="size-4" /> {a.label}</p>
                {a.isDefault && <Badge variant="outline" className="border-brand/40 text-brand">Default</Badge>}
              </div>
              <div className="text-sm text-muted-foreground">
                <p className="text-foreground">{a.recipientName} · {a.phone}</p>
                <p>{a.addressLine}, {a.city}</p>
                {a.notes && <p>Note: {a.notes}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing({ id: a.id, form: toInput(a) })}>Edit</Button>
                {!a.isDefault && <Button size="sm" variant="outline" disabled={makeDefault.isPending} onClick={() => makeDefault.mutate(a)}>Make default</Button>}
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={remove.isPending} onClick={() => remove.mutate(a.id)}>
                  <Trash2 /> Remove
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!editing && list.length < 10 && (
          <button
            type="button"
            onClick={() => setEditing({ id: null, form: { ...EMPTY_ADDRESS, recipientName: user.fullName, phone: user.phone ?? '', label: list.length ? '' : 'Home' } })}
            className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground transition hover:border-brand/60 hover:text-foreground"
          >
            <Plus className="size-5" /> Add an address
          </button>
        )}
      </div>
      {list.length === 0 && !editing && <p className="text-sm text-muted-foreground">Addresses you save here, or at checkout, are offered next time you order.</p>}

      {editing && f && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{editing.id ? 'Edit address' : 'New address'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(editing) }}>
              <div className="space-y-2">
                <Label htmlFor="a-label">Label</Label>
                <Input id="a-label" className="h-10" placeholder="Home, Office…" value={f.label} onChange={(e) => set('label', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="a-name">Recipient</Label>
                <Input id="a-name" className="h-10" required value={f.recipientName} onChange={(e) => set('recipientName', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="a-phone">Phone</Label>
                <Input id="a-phone" className="h-10" type="tel" required placeholder="0911 234 567" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="a-city">City</Label>
                <Input id="a-city" className="h-10" required value={f.city} onChange={(e) => set('city', e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="a-line">Street, area and house / building</Label>
                <Input id="a-line" className="h-10" required value={f.addressLine} onChange={(e) => set('addressLine', e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="a-notes">Notes for the rider</Label>
                <Input id="a-notes" className="h-10" value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
              </div>
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" disabled={save.isPending}>{save.isPending && <Loader2 className="animate-spin" />} Save address</Button>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function toInput(a: Address): AddressInput {
  return { label: a.label, recipientName: a.recipientName, phone: a.phone, addressLine: a.addressLine, city: a.city, notes: a.notes ?? '' }
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
        <CardDescription>
          Used to prefill checkout.{' '}
          {user.phoneVerified ? `You sign in with ${user.phone}.` : user.email ? `You sign in with ${user.email}.` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" className="h-10" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" className="h-10" type="tel" placeholder="0911 234 567" value={form.phone} disabled={user.phoneVerified} aria-describedby={user.phoneVerified ? 'phone-locked' : undefined} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            {user.phoneVerified && <p id="phone-locked" className="text-xs text-muted-foreground">Verified by SMS. You sign in with this number.</p>}
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
  const { session, setSession, clear } = useSession()
  // accounts from before phone sign-in don't carry the flag: they have a password
  const hasPassword = session?.user.hasPassword !== false
  const phone = session?.user.phone ?? ''
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
      {hasPassword ? (
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
      ) : (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="size-4" /> Signing in</CardTitle>
          <CardDescription>You sign in with your phone {phone} and a code we text you. There is no password to remember or change.</CardDescription>
        </CardHeader>
      </Card>
      )}
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
          <p className="text-sm text-muted-foreground">{userContact(session.user)}</p>
        </div>
        <Button asChild variant="outline" className="ml-auto rounded-full">
          <Link to="/sell"><Store /> Sell</Link>
        </Button>
      </div>
      <Tabs value={params.get('tab') ?? 'orders'} onValueChange={(tab) => setParams(tab === 'orders' ? {} : { tab }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="orders">My orders</TabsTrigger>
          <TabsTrigger value="addresses">Addresses</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>
        <TabsContent value="orders" className="space-y-4 pt-4">
          <ToReview />
          <div className="flex flex-wrap gap-2 text-sm">
            <Link to="/jobs" className="rounded-full border px-3 py-1.5 font-semibold hover:border-primary/40">My jobs</Link>
            <Link to="/chats" className="rounded-full border px-3 py-1.5 font-semibold hover:border-primary/40">My chats</Link>
            <Link to="/pro" className="rounded-full border px-3 py-1.5 font-semibold hover:border-primary/40">Offer my skills</Link>
          </div>
          <MyOrders />
        </TabsContent>
        <TabsContent value="addresses" className="pt-4"><Addresses /></TabsContent>
        <TabsContent value="profile" className="pt-4"><Profile /></TabsContent>
        <TabsContent value="security" className="pt-4"><Security /></TabsContent>
      </Tabs>
    </div>
  )
}
