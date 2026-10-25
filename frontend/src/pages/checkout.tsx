import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { Loader2, Lock, MapPin, ShoppingBag, Tag, Truck, UserRound, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'

import { ProductVisual } from '@/components/product-visual'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useFeatures } from '@/lib/features'
import { t as tr, useT } from '@/lib/i18n'
import { api, ApiError, deliveryFee, type Address, type PriceQuote } from '@/lib/api'
import { formatETB, orderContact } from '@/lib/format'
import { cn } from '@/lib/utils'
import { cartTotals, useCart } from '@/store/cart'
import { userContact, useSession } from '@/store/session'

const schema = z.object({
  name: z.string().trim().min(2, 'Enter your full name').max(200),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{9,20}$/, 'Enter a valid phone number, e.g. 0911 234 567'),
  email: z.email('Enter a valid email address'),
  address: z.string().trim().min(5, 'Enter the street, area and house or building').max(300),
  city: z.string().trim().min(2, 'Enter the city').max(100),
  notes: z.string().trim().max(300, 'Keep notes under 300 characters'),
})

type Form = z.infer<typeof schema>
type Errors = Partial<Record<keyof Form, string>>

/** Backend validation errors come back as customer.name / delivery.address; map them onto the form fields. */
function fieldErrors(raw: Record<string, string>): Errors {
  const out: Errors = {}
  for (const [k, v] of Object.entries(raw)) {
    const key = k.split('.').pop() as keyof Form
    out[key] ??= v
  }
  return out
}

/** Online payment is switched off (Admin → Features): buying works by contacting the seller. */
function PaymentsOff() {
  const t = useT()
  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">{t('Contact the seller to buy')}</h1>
      <p className="text-muted-foreground">
        {t('Open an item, then chat with the seller or tap "Show phone number" to call them. Agree on the price, meet in a safe place, check the item, then pay.')}
      </p>
      <Button asChild size="lg"><Link to="/shop">{t('Browse items')}</Link></Button>
    </div>
  )
}

export function CheckoutPage() {
  const { payments, loaded } = useFeatures()
  if (loaded && !payments) return <PaymentsOff />
  return <CheckoutForm />
}

function CheckoutForm() {
  const t = useT()
  const { lines, clear } = useCart()
  const { subtotal } = cartTotals(lines)
  const navigate = useNavigate()
  const user = useSession((s) => s.session?.user)
  const clearSession = useSession((s) => s.clear)
  const isCustomer = user?.role === 'CUSTOMER'
  const [form, setForm] = useState<Form>({
    name: user?.fullName ?? '',
    phone: user?.phone ?? '',
    email: user?.email ?? '',
    address: '',
    city: 'Wolaita Sodo',
    notes: '',
  })
  const [errors, setErrors] = useState<Errors>({})
  const [saveAddress, setSaveAddress] = useState(true)
  const [chosen, setChosen] = useState<number | null>(null)

  const quote = useQuery({ queryKey: ['delivery'], queryFn: api.delivery, staleTime: 5 * 60_000 })
  const saved = useQuery({ queryKey: ['addresses'], queryFn: api.addresses, enabled: isCustomer })
  // Discount code: the server works out the price; re-checked whenever the cart changes
  const [codeInput, setCodeInput] = useState('')
  const [applied, setApplied] = useState<PriceQuote | null>(null)
  const [codeError, setCodeError] = useState('')
  const cartItems = lines.map((l) => ({ productId: l.productId, quantity: l.quantity }))
  const cartKey = JSON.stringify(cartItems)
  // Server price for the cart: one parcel per seller, each with its own delivery fee
  const cartQuote = useQuery({
    queryKey: ['cart-quote', cartKey],
    queryFn: () => api.cartQuote(cartItems),
    enabled: lines.length > 0,
    placeholderData: keepPreviousData,
  })
  const applyCode = useMutation({
    mutationFn: (code: string) => api.checkDiscount(cartItems, code),
    onSuccess: (q) => {
      setApplied(q)
      setCodeError('')
      setCodeInput(q.discountCode)
    },
    onError: (e) => {
      setApplied(null)
      setCodeError(e.message)
    },
  })
  useEffect(() => {
    if (applied && lines.length > 0) applyCode.mutate(applied.discountCode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey])

  const discount = applied?.discount ?? 0
  const itemsAfterDiscount = subtotal - discount
  const priced = applied ?? cartQuote.data
  const fee = priced ? priced.deliveryFee : deliveryFee(quote.data, itemsAfterDiscount)
  const parcels = priced?.parcels ?? []
  const toFree = parcels.length <= 1 && quote.data && quote.data.freeOver > 0 && fee > 0 ? quote.data.freeOver - itemsAfterDiscount : 0

  const pickAddress = (a: Address) => {
    setChosen(a.id)
    setForm((f) => ({ ...f, name: a.recipientName, phone: a.phone, address: a.addressLine, city: a.city, notes: a.notes ?? '' }))
  }

  // Prefill with the default saved address once it loads
  useEffect(() => {
    const def = saved.data?.find((a) => a.isDefault)
    if (def && chosen === null && !form.address) pickAddress(def)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved.data])

  const checkout = useMutation({
    mutationFn: api.checkout,
    onSuccess: (res, vars) => {
      orderContact.save(res.orderNumber, vars.customer.phone)
      clear()
      window.location.assign(res.checkoutUrl)
    },
    onError: (err, vars) => {
      if (err instanceof ApiError && err.code === 'PAYMENT_PROVIDER_ERROR' && typeof err.body.orderNumber === 'string') {
        // The order exists; send the shopper to its status page where they can retry.
        orderContact.save(err.body.orderNumber, vars.customer.phone)
        clear()
        toast.error(err.message)
        navigate(`/checkout/return?order=${err.body.orderNumber}`)
        return
      }
      if (err instanceof ApiError && err.status === 401) {
        // The session ended while filling in the form; the cart is kept.
        toast.error(tr('Please sign in again to finish your order.'))
        navigate('/login?next=/checkout')
        return
      }
      if (err instanceof ApiError && err.code === 'VALIDATION_FAILED') {
        setErrors(fieldErrors((err.body.errors as Record<string, string>) ?? {}))
      }
      if (err instanceof ApiError && err.code === 'DISCOUNT_INVALID') {
        // e.g. the last use was taken while the shopper was filling in the form
        setApplied(null)
        setCodeError(err.message)
      }
      toast.error(err.message)
    },
  })

  // Buying needs a customer account: guests sign in (or sign up) first and come back here with the cart kept.
  if (!user && !checkout.isPending && !checkout.isSuccess) return <Navigate to="/login?next=/checkout" replace />
  if (user && !isCustomer) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <div className="grid size-16 place-items-center rounded-full bg-muted">
          <UserRound className="size-7 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-semibold">{t('Staff accounts can’t place orders')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('You’re signed in as {contact}. Sign out, then sign in with a customer account to buy.', { contact: userContact(user) })}
        </p>
        <Button onClick={() => { clearSession(); navigate('/login?next=/checkout') }}>{t('Sign out and continue')}</Button>
      </div>
    )
  }

  if (lines.length === 0 && !checkout.isPending && !checkout.isSuccess) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <div className="grid size-16 place-items-center rounded-full bg-muted">
          <ShoppingBag className="size-7 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-semibold">{t('Your cart is empty')}</h1>
        <Button asChild>
          <Link to="/shop">{t('Browse products')}</Link>
        </Button>
      </div>
    )
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = schema.safeParse(form)
    if (!parsed.success) {
      const next: Errors = {}
      for (const issue of parsed.error.issues) next[issue.path[0] as keyof Form] ??= issue.message
      setErrors(next)
      document.getElementById(String(parsed.error.issues[0].path[0]))?.focus()
      return
    }
    setErrors({})
    const d = parsed.data
    checkout.mutate({
      items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      customer: { name: d.name, phone: d.phone, email: d.email },
      delivery: { address: d.address, city: d.city, notes: d.notes || undefined },
      saveAddress: isCustomer && chosen === null && saveAddress,
      discountCode: applied?.discountCode,
    })
  }

  const set = (key: keyof Form, value: string) => {
    setForm({ ...form, [key]: value })
    if (key === 'address' || key === 'city') setChosen(null)
  }

  const field = (key: keyof Form, label: string, props: React.ComponentProps<'input'>) => (
    <div className="space-y-2">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
        aria-invalid={!!errors[key]}
        className="h-10"
        {...props}
      />
      {errors[key] && <p className="text-sm text-destructive">{t(errors[key])}</p>}
    </div>
  )

  const busy = checkout.isPending || checkout.isSuccess
  const total = itemsAfterDiscount + fee

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t('Checkout')}</h1>
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_400px]">
        <form id="checkout-form" onSubmit={submit} className="space-y-6" noValidate>
          <Card>
            <CardHeader>
              <CardTitle>{t('Contact details')}</CardTitle>
              <CardDescription>
                {t('Filled in from your account. BillPay uses these to send your payment request and receipt.')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {field('name', t('Full name'), { autoComplete: 'name', placeholder: 'Abebe Kebede' })}
              <div className="grid gap-5 sm:grid-cols-2">
                {field('phone', t('Phone number'), { autoComplete: 'tel', inputMode: 'tel', placeholder: '0911 234 567' })}
                {field('email', t('Email'), { autoComplete: 'email', type: 'email', placeholder: 'abebe@example.et' })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Truck className="size-5" /> {t('Delivery')}</CardTitle>
              <CardDescription>{t('Delivery in Wolaita Sodo. The seller or rider calls the phone above.')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {saved.data && saved.data.length > 0 && (
                <div className="space-y-2">
                  <Label>{t('Saved addresses')}</Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {saved.data.map((a) => (
                      <button
                        type="button"
                        key={a.id}
                        onClick={() => pickAddress(a)}
                        className={cn(
                          'rounded-xl border p-3 text-left text-sm transition hover:border-brand/60',
                          chosen === a.id && 'border-brand bg-brand/5 ring-1 ring-brand',
                        )}
                      >
                        <span className="flex items-center gap-1.5 font-medium"><MapPin className="size-3.5" /> {a.label}{a.isDefault && <span className="text-xs font-normal text-muted-foreground">· {t('default')}</span>}</span>
                        <span className="mt-1 block text-muted-foreground">{a.addressLine}, {a.city}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {field('address', t('Street, area and house / building'), { autoComplete: 'street-address', placeholder: t('Arada, near the church, house 12') })}
              {field('city', t('City'), { autoComplete: 'address-level2', placeholder: 'Wolaita Sodo' })}
              <div className="space-y-2">
                <Label htmlFor="notes">{t('Notes for the rider')} <span className="font-normal text-muted-foreground">{t('(optional)')}</span></Label>
                <Textarea id="notes" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder={t('Gate colour, landmark, best time to call…')} aria-invalid={!!errors.notes} />
                {errors.notes && <p className="text-sm text-destructive">{t(errors.notes)}</p>}
              </div>
              {isCustomer && chosen === null && (
                <label className="flex items-center justify-between gap-4 rounded-xl border p-3 text-sm">
                  <span>{t('Save this address to my account')}</span>
                  <Switch checked={saveAddress} onCheckedChange={setSaveAddress} aria-label={t('Save this address')} />
                </label>
              )}
            </CardContent>
          </Card>
        </form>

        <Card className="h-fit lg:sticky lg:top-24">
          <CardHeader>
            <CardTitle>{t('Order summary')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {lines.map((l) => (
              <div key={l.productId} className="flex items-center gap-3">
                <ProductVisual categorySlug={l.categorySlug} imageUrl={l.imageUrl} name={l.name} className="size-12 shrink-0 rounded-lg" iconClassName="size-5" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.name}</p>
                  <p className="text-xs text-muted-foreground">{t('Qty {n}', { n: l.quantity })}</p>
                </div>
                <span className="text-sm tabular-nums">{formatETB(l.price * l.quantity)}</span>
              </div>
            ))}
            <Separator />
            <form
              className="space-y-1.5"
              onSubmit={(e) => {
                e.preventDefault()
                if (codeInput.trim()) applyCode.mutate(codeInput.trim())
              }}
            >
              <div className="flex gap-2">
                <Input
                  aria-label={t('Discount code')}
                  placeholder={t('Discount code')}
                  className="h-9 uppercase placeholder:normal-case"
                  value={codeInput}
                  onChange={(e) => {
                    setCodeInput(e.target.value)
                    setCodeError('')
                  }}
                  disabled={!!applied}
                  aria-invalid={!!codeError}
                />
                {applied ? (
                  <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => { setApplied(null); setCodeInput('') }}>
                    <X /> {t('Remove')}
                  </Button>
                ) : (
                  <Button type="submit" variant="outline" size="sm" className="h-9" disabled={!codeInput.trim() || applyCode.isPending}>
                    {applyCode.isPending ? <Loader2 className="animate-spin" /> : <Tag />} {t('Apply')}
                  </Button>
                )}
              </div>
              {codeError && <p className="text-xs text-destructive">{codeError}</p>}
              {applied?.discountDescription && <p className="text-xs text-success">{applied.discountDescription}</p>}
            </form>
            <Separator />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('Subtotal')}</span>
              <span className="tabular-nums">{formatETB(subtotal)}</span>
            </div>
            {applied && discount > 0 && (
              <div className="flex justify-between text-sm text-success">
                <span>{t('Discount ({code})', { code: applied.discountCode })}</span>
                <span className="tabular-nums">−{formatETB(discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{parcels.length > 1 ? t('Delivery ({n} sellers)', { n: parcels.length }) : t('Delivery')}</span>
              <span className="tabular-nums">{quote.isLoading ? '…' : fee === 0 ? t('Free') : formatETB(fee)}</span>
            </div>
            {parcels.length > 1 && (
              <ul className="space-y-1 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                {parcels.map((p, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="truncate">{t('From {seller} ({amount})', { seller: p.seller ?? 'Sodo Gebeya', amount: formatETB(p.itemsTotal) })}</span>
                    <span className="tabular-nums">{p.deliveryFee === 0 ? t('Free') : formatETB(p.deliveryFee)}</span>
                  </li>
                ))}
                <li className="pt-1">{t('Each seller delivers their own items, so they may arrive separately.')}</li>
              </ul>
            )}
            {toFree > 0 && (
              <p className="rounded-lg bg-accent px-3 py-2 text-xs text-accent-foreground">
                {t('Add {amount} more for free delivery.', { amount: formatETB(toFree) })}
              </p>
            )}
            <div className="flex justify-between text-lg font-semibold">
              <span>{t('Total')}</span>
              <span className="tabular-nums">{formatETB(total)}</span>
            </div>
            <Button type="submit" form="checkout-form" size="lg" className="h-11 w-full text-base" disabled={busy || quote.isLoading}>
              {busy ? <><Loader2 className="animate-spin" /> {t('Redirecting to BillPay…')}</> : <><Lock /> {t('Pay {amount} with BillPay', { amount: formatETB(total) })}</>}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              {t('You’ll finish paying on BillPay’s secure page with Wallet, Bank or Card.')}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
