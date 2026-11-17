import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Briefcase, Camera, ChevronRight, KeyRound, Loader2, LogOut, MapPin, MessageCircle, Package, Plus, ShieldAlert, Store, Trash2, UserRound } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { ImageCropDialog } from '@/components/image-crop'
import { ToReview } from '@/components/reviews'
import { LocationPicker } from '@/components/location-picker'
import { ZoomPicture } from '@/components/zoom-picture'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api, type Address, type AddressInput } from '@/lib/api'
import { formatDate, formatETB } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { userContact, useSession, type SessionUser } from '@/store/session'

const STATUS_TONE: Record<string, string> = {
  PAID: 'bg-success/15 text-success border-success/30',
  PENDING_PAYMENT: 'bg-brand/10 text-brand border-brand/30',
  PAYMENT_FAILED: 'bg-destructive/10 text-destructive border-destructive/30',
  REVIEW_REQUIRED: 'bg-warning/15 border-warning/40',
}

function MyOrders() {
  const t = useT()
  const [page, setPage] = useState(0)
  const { data, isLoading } = useQuery({ queryKey: ['my-orders', page], queryFn: () => api.myOrders(page), placeholderData: keepPreviousData })
  if (isLoading) return <p className="py-10 text-center text-sm text-muted-foreground">{t('Loading your orders…')}</p>
  if (!data || data.content.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed py-14 text-center">
        <Package className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t('No orders yet. Orders you place while signed in show up here.')}</p>
        <Button asChild>
          <Link to="/shop">{t('Start shopping')}</Link>
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
              {formatDate(o.createdAt)} · {o.itemCount === 1 ? t('{n} item', { n: o.itemCount }) : t('{n} items', { n: o.itemCount })}
              {(o.status === 'PENDING_PAYMENT' || o.status === 'PAYMENT_FAILED') && (
                <span className="font-medium text-brand"> · {t('Not paid yet, open to finish paying')}</span>
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
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>{t('Previous')}</Button>
          <Button variant="outline" size="sm" disabled={page + 1 >= data.totalPages} onClick={() => setPage(page + 1)}>{t('Next')}</Button>
        </div>
      )}
    </div>
  )
}

const EMPTY_ADDRESS: AddressInput = { label: '', recipientName: '', phone: '', addressLine: '', city: 'Wolaita Sodo', notes: '' }

function Addresses() {
  const t = useT()
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
    onSuccess: (list, v) => done(list, v.id ? t('Address updated') : t('Address saved')),
    onError: (e) => toast.error(e.message),
  })
  const remove = useMutation({
    mutationFn: api.deleteAddress,
    onSuccess: (list) => done(list, t('Address removed')),
    onError: (e) => toast.error(e.message),
  })
  const makeDefault = useMutation({
    mutationFn: (a: Address) => api.updateAddress(a.id, { ...toInput(a), makeDefault: true }),
    onSuccess: (list) => done(list, t('Default address changed')),
    onError: (e) => toast.error(e.message),
  })

  if (isLoading) return <p className="py-10 text-center text-sm text-muted-foreground">{t('Loading addresses…')}</p>
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
                {a.isDefault && <Badge variant="outline" className="border-brand/40 text-brand">{t('Default')}</Badge>}
              </div>
              <div className="text-sm text-muted-foreground">
                <p className="text-foreground">{a.recipientName} · {a.phone}</p>
                <p>{a.addressLine}, {a.city}</p>
                {a.notes && <p>{t('Note: {notes}', { notes: a.notes })}</p>}
                {a.latitude != null && a.longitude != null && <p className="flex items-center gap-1 text-xs font-medium text-brand"><MapPin className="size-3.5" /> {t('Pin on the map')}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing({ id: a.id, form: toInput(a) })}>{t('Edit')}</Button>
                {!a.isDefault && <Button size="sm" variant="outline" disabled={makeDefault.isPending} onClick={() => makeDefault.mutate(a)}>{t('Make default')}</Button>}
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={remove.isPending} onClick={() => remove.mutate(a.id)}>
                  <Trash2 /> {t('Remove')}
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
            <Plus className="size-5" /> {t('Add an address')}
          </button>
        )}
      </div>
      {list.length === 0 && !editing && <p className="text-sm text-muted-foreground">{t('Addresses you save here, or at checkout, are offered next time you order.')}</p>}

      {editing && f && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{editing.id ? t('Edit address') : t('New address')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(editing) }}>
              <div className="space-y-2">
                <Label htmlFor="a-label">{t('Label')}</Label>
                <Input id="a-label" className="h-10" placeholder={t('Home, Office…')} value={f.label} onChange={(e) => set('label', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="a-name">{t('Recipient')}</Label>
                <Input id="a-name" className="h-10" required value={f.recipientName} onChange={(e) => set('recipientName', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="a-phone">{t('Phone')}</Label>
                <Input id="a-phone" className="h-10" type="tel" required placeholder="0911 234 567" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="a-city">{t('City')}</Label>
                <Input id="a-city" className="h-10" required value={f.city} onChange={(e) => set('city', e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="a-line">{t('Street, area and house / building')}</Label>
                <Input id="a-line" className="h-10" required value={f.addressLine} onChange={(e) => set('addressLine', e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="a-notes">{t('Notes for the rider')}</Label>
                <Input id="a-notes" className="h-10" value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>{t('Pin on the map (optional)')}</Label>
                <LocationPicker
                  value={f.latitude != null && f.longitude != null ? { lat: f.latitude, lng: f.longitude } : null}
                  onChange={(pin) => setEditing((cur) => (cur ? { ...cur, form: { ...cur.form, latitude: pin?.lat ?? null, longitude: pin?.lng ?? null } } : cur))}
                />
              </div>
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" disabled={save.isPending}>{save.isPending && <Loader2 className="animate-spin" />} {t('Save address')}</Button>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>{t('Cancel')}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function toInput(a: Address): AddressInput {
  return {
    label: a.label,
    recipientName: a.recipientName,
    phone: a.phone,
    addressLine: a.addressLine,
    city: a.city,
    notes: a.notes ?? '',
    latitude: a.latitude,
    longitude: a.longitude,
  }
}

/** The profile picture, or the first letter of the name on a coloured circle when there is none. */
function Avatar({ user, size }: { user: SessionUser; size: number }) {
  return user.avatarUrl ? (
    <img src={user.avatarUrl} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-primary font-semibold text-primary-foreground"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      aria-hidden
    >
      {user.fullName[0]?.toUpperCase()}
    </span>
  )
}

/** A square profile picture, cropped in the browser before it is saved (see ImageCropDialog). */
function ProfilePicture({ user }: { user: SessionUser }) {
  const t = useT()
  const { setUser } = useSession()
  const input = useRef<HTMLInputElement>(null)
  const [picking, setPicking] = useState<File | null>(null)
  const upload = useMutation({
    mutationFn: (f: File) => api.avatar.upload(f),
    onSuccess: (u) => {
      setUser(u)
      setPicking(null)
      toast.success(t('Profile picture saved'))
    },
    onError: (e) => toast.error(e.message),
  })
  const remove = useMutation({
    mutationFn: () => api.avatar.remove(),
    onSuccess: (u) => {
      setUser(u)
      toast.success(t('Profile picture removed'))
    },
    onError: (e) => toast.error(e.message),
  })
  const pick = (f?: File) => {
    if (!f) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) return toast.error(t('Use a JPG, PNG or WebP photo.'))
    if (f.size > 5 * 1024 * 1024) return toast.error(t('That photo is larger than 5 MB.'))
    setPicking(f)
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Camera className="size-4" /> {t('Profile picture')}</CardTitle>
        <CardDescription>{t('A square photo of you. Others see it in chats.')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-5">
        <Avatar user={user} size={96} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => input.current?.click()} disabled={upload.isPending}>
            {upload.isPending && <Loader2 className="animate-spin" />} {user.avatarUrl ? t('Change picture') : t('Add picture')}
          </Button>
          {user.avatarUrl && (
            <Button variant="ghost" className="text-destructive" onClick={() => remove.mutate()} disabled={remove.isPending}>
              <Trash2 /> {t('Remove')}
            </Button>
          )}
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
      </CardContent>
      {picking && (
        <ImageCropDialog
          file={picking}
          aspect={1}
          round
          outWidth={512}
          title={t('Crop your picture')}
          onCancel={() => setPicking(null)}
          onDone={(f) => upload.mutate(f)}
        />
      )}
    </Card>
  )
}

/**
 * Your public profile. Others see the first name, picture, bio and area, and only when the switch is on.
 * The preview is live: it changes as you type, before anything is saved.
 */
function PublicProfileCard({ user }: { user: SessionUser }) {
  const t = useT()
  const { setUser } = useSession()
  const [form, setForm] = useState({
    profilePublic: user.profilePublic ?? false,
    bio: user.bio ?? '',
    area: user.area ?? '',
  })
  const firstName = user.fullName.trim().split(/\s+/)[0] ?? ''
  const save = useMutation({
    mutationFn: () => api.publicProfile(form),
    onSuccess: (u) => {
      setUser(u)
      toast.success(t('Public profile saved'))
    },
    onError: (e) => toast.error(e.message),
  })
  const dirty =
    form.profilePublic !== (user.profilePublic ?? false) || form.bio !== (user.bio ?? '') || form.area !== (user.area ?? '')
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><UserRound className="size-4" /> {t('Public profile')}</CardTitle>
        <CardDescription>{t('Choose what others see when they open your name. Your phone, email and surname are never shown.')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
          <label className="flex items-center justify-between gap-4 rounded-xl border p-3">
            <span>
              <span className="block text-sm font-semibold">{t('Show my public profile')}</span>
              <span className="block text-xs text-muted-foreground">{form.profilePublic ? t('On: others can open it.') : t('Off: only you can see it.')}</span>
            </span>
            <Switch checked={form.profilePublic} onCheckedChange={(v) => setForm({ ...form, profilePublic: v })} aria-label={t('Show my public profile')} />
          </label>
          <div className="space-y-2">
            <Label htmlFor="pp-bio">{t('About you')}</Label>
            <Textarea id="pp-bio" rows={3} maxLength={300} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder={t('A line about you: what you buy, sell or like')} />
            <p className="text-xs text-muted-foreground">{form.bio.length}/300</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pp-area">{t('Area in Sodo')}</Label>
            <Input id="pp-area" className="h-10" maxLength={120} value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder={t('e.g. Arada')} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!dirty || save.isPending}>{save.isPending && <Loader2 className="animate-spin" />} {t('Save')}</Button>
            {user.profilePublic && (
              <Button asChild variant="outline"><Link to={`/people/${user.id}`}>{t('Open my public page')}</Link></Button>
            )}
          </div>
        </form>

        <div className="space-y-2">
          <p className="text-sm font-semibold">{t('Live preview: how others see you')}</p>
          <div className="rounded-2xl border bg-muted/30 p-5 text-center">
            {form.profilePublic ? (
              <div className="space-y-3">
                <Avatar user={user} size={80} />
                <p className="text-lg font-bold">{firstName}</p>
                {form.area && <p className="text-sm text-muted-foreground">{form.area}</p>}
                {form.bio && <p className="text-sm leading-relaxed text-muted-foreground">{form.bio}</p>}
              </div>
            ) : (
              <p className="py-6 text-sm text-muted-foreground">{t('Your profile is off. Switch it on to show this to others.')}</p>
            )}
          </div>
          {dirty && <p className="text-xs text-amber-ink">{t('Not saved yet. Press Save to publish these changes.')}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

function Profile() {
  const t = useT()
  const { session, setUser } = useSession()
  const user = session!.user
  const [form, setForm] = useState({ fullName: user.fullName, phone: user.phone ?? '' })
  const save = useMutation({
    mutationFn: () => api.updateMe(form),
    onSuccess: (u) => {
      setUser(u)
      toast.success(t('Profile saved'))
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <div className="space-y-6">
      <ProfilePicture user={user} />
      <PublicProfileCard user={user} />
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><UserRound className="size-4" /> {t('Profile')}</CardTitle>
        <CardDescription>
          {t('Used to prefill checkout.')}{' '}
          {user.phoneVerified ? t('You sign in with {contact}.', { contact: user.phone ?? '' }) : user.email ? t('You sign in with {contact}.', { contact: user.email }) : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
          <div className="space-y-2">
            <Label htmlFor="fullName">{t('Full name')}</Label>
            <Input id="fullName" className="h-10" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">{t('Phone')}</Label>
            <Input id="phone" className="h-10" type="tel" placeholder="0911 234 567" value={form.phone} disabled={user.phoneVerified} aria-describedby={user.phoneVerified ? 'phone-locked' : undefined} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            {user.phoneVerified && <p id="phone-locked" className="text-xs text-muted-foreground">{t('Verified by SMS. You sign in with this number.')}</p>}
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={save.isPending}>{save.isPending && <Loader2 className="animate-spin" />} {t('Save')}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
    </div>
  )
}

function Security() {
  const t = useT()
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
      toast.success(t('Password changed. Other devices have been signed out.'))
    },
    onError: (e) => setError(e.message),
  })
  const everywhere = useMutation({
    mutationFn: api.logoutEverywhere,
    onSuccess: () => {
      clear()
      qc.clear()
      toast.success(t('Signed out on every device'))
      navigate('/login')
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {hasPassword ? (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="size-4" /> {t('Change password')}</CardTitle>
          <CardDescription>{t('Changing it signs you out on your other devices.')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              setError('')
              if (pw.next !== pw.confirm) return setError(t('New passwords don’t match.'))
              change.mutate()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="current">{t('Current password')}</Label>
              <PasswordInput id="current" autoComplete="current-password" className="h-10" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="next">{t('New password')}</Label>
              <PasswordInput id="next" autoComplete="new-password" className="h-10" required value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
              <p className="text-xs text-muted-foreground">{t('At least 8 characters, with a letter and a number.')}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">{t('Confirm new password')}</Label>
              <PasswordInput id="confirm" autoComplete="new-password" className="h-10" required value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={change.isPending}>{change.isPending && <Loader2 className="animate-spin" />} {t('Change password')}</Button>
          </form>
        </CardContent>
      </Card>
      ) : (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="size-4" /> {t('Signing in')}</CardTitle>
          <CardDescription>{t('You sign in with your phone {phone} and a code we text you. There is no password to remember or change.', { phone })}</CardDescription>
        </CardHeader>
      </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><ShieldAlert className="size-4" /> {t('Sessions')}</CardTitle>
          <CardDescription>{t('Lost a phone or signed in on a shared computer? End every session at once.')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => everywhere.mutate()} disabled={everywhere.isPending}>
            {everywhere.isPending ? <Loader2 className="animate-spin" /> : <LogOut />} {t('Sign out everywhere')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export function AccountPage() {
  const t = useT()
  const session = useSession((s) => s.session)
  const [params, setParams] = useSearchParams()
  if (!session) return <Navigate to="/login?next=/account" replace />
  const user = session.user
  const tab = params.get('tab') ?? 'orders'
  const tiles = [
    { label: t('Orders'), hint: t('Track and pay'), icon: Package, to: '/account', tone: 'bg-accent text-accent-foreground' },
    { label: t('Chats'), hint: t('Talk to sellers'), icon: MessageCircle, to: '/chats', tone: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300' },
    { label: t('Addresses'), hint: t('Delivery places'), icon: MapPin, to: '/account?tab=addresses', tone: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
    { label: t('Jobs'), hint: t('Work near you'), icon: Briefcase, to: '/jobs', tone: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300' },
  ]
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary to-brand p-5 text-primary-foreground shadow-lg sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 size-72 rounded-full bg-amber-300/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <ZoomPicture src={user.avatarUrl ?? null} alt={user.fullName} className="shrink-0">
            <span className="block rounded-full ring-4 ring-white/30">
              <Avatar user={user} size={88} />
            </span>
          </ZoomPicture>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-primary-foreground/75">{t('Welcome back')}</p>
            <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{user.fullName}</h1>
            <p className="truncate text-sm text-primary-foreground/80">{userContact(user)}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full bg-white/15 px-2.5 py-1">{user.profilePublic ? t('Public profile on') : t('Profile private')}</span>
              {user.area && <span className="rounded-full bg-white/15 px-2.5 py-1">{user.area}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary" className="rounded-full">
              <Link to="/sell"><Store /> {t('Sell')}</Link>
            </Button>
            {user.profilePublic && (
              <Button asChild variant="outline" className="rounded-full border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white">
                <Link to={`/people/${user.id}`}>{t('View public profile')}</Link>
              </Button>
            )}
          </div>
        </div>
      </section>

      <nav aria-label={t('Quick links')} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((tile) => (
          <Link
            key={tile.label}
            to={tile.to}
            className="group flex flex-col gap-3 rounded-2xl border bg-card p-4 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
          >
            <span className={cn('grid size-10 place-items-center rounded-xl', tile.tone)}>
              <tile.icon className="size-5" />
            </span>
            <span>
              <span className="block font-semibold">{tile.label}</span>
              <span className="block text-xs text-muted-foreground">{tile.hint}</span>
            </span>
          </Link>
        ))}
      </nav>

      <Tabs value={tab} onValueChange={(next) => setParams(next === 'orders' ? {} : { tab: next }, { replace: true })}>
        <TabsList className="flex w-full justify-start overflow-x-auto rounded-full bg-muted p-1">
          <TabsTrigger value="orders" className="rounded-full">{t('My orders')}</TabsTrigger>
          <TabsTrigger value="addresses" className="rounded-full">{t('Addresses')}</TabsTrigger>
          <TabsTrigger value="profile" className="rounded-full">{t('Profile')}</TabsTrigger>
          <TabsTrigger value="security" className="rounded-full">{t('Security')}</TabsTrigger>
        </TabsList>
        <TabsContent value="orders" className="space-y-4 pt-5">
          <ToReview />
          <div className="flex flex-wrap gap-2 text-sm">
            <Link to="/jobs" className="rounded-full border px-3 py-1.5 font-semibold hover:border-primary/40">{t('My jobs')}</Link>
            <Link to="/chats" className="rounded-full border px-3 py-1.5 font-semibold hover:border-primary/40">{t('My chats')}</Link>
            <Link to="/pro" className="rounded-full border px-3 py-1.5 font-semibold hover:border-primary/40">{t('Offer my skills')}</Link>
          </div>
          <MyOrders />
        </TabsContent>
        <TabsContent value="addresses" className="pt-5"><Addresses /></TabsContent>
        <TabsContent value="profile" className="pt-5"><Profile /></TabsContent>
        <TabsContent value="security" className="pt-5"><Security /></TabsContent>
      </Tabs>
    </div>
  )
}
