import { useMutation, useQuery } from '@tanstack/react-query'
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

export function CheckoutPage() {
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
    city: 'Addis Ababa',
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
  const fee = applied ? applied.deliveryFee : deliveryFee(quote.data, itemsAfterDiscount)
  const toFree = quote.data && quote.data.freeOver > 0 && fee > 0 ? quote.data.freeOver - itemsAfterDiscount : 0

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
        toast.error('Please sign in again to finish your order.')
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
        <h1 className="text-2xl font-semibold">Staff accounts can’t place orders</h1>
        <p className="text-sm text-muted-foreground">
          You’re signed in as {userContact(user)}. Sign out, then sign in with a customer account to buy.
        </p>
        <Button onClick={() => { clearSession(); navigate('/login?next=/checkout') }}>Sign out and continue</Button>
      </div>
    )
  }

  if (lines.length === 0 && !checkout.isPending && !checkout.isSuccess) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <div className="grid size-16 place-items-center rounded-full bg-muted">
          <ShoppingBag className="size-7 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-semibold">Your cart is empty</h1>
        <Button asChild>
          <Link to="/shop">Browse products</Link>
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
      {errors[key] && <p className="text-sm text-destructive">{errors[key]}</p>}
    </div>
  )

  const busy = checkout.isPending || checkout.isSuccess
  const total = itemsAfterDiscount + fee

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Checkout</h1>
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_400px]">
        <form id="checkout-form" onSubmit={submit} className="space-y-6" noValidate>
          <Card>
            <CardHeader>
              <CardTitle>Contact details</CardTitle>
              <CardDescription>
                Filled in from your account. BillPay uses these to send your payment request and receipt.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {field('name', 'Full name', { autoComplete: 'name', placeholder: 'Abebe Kebede' })}
              <div className="grid gap-5 sm:grid-cols-2">
                {field('phone', 'Phone number', { autoComplete: 'tel', inputMode: 'tel', placeholder: '0911 234 567' })}
                {field('email', 'Email', { autoComplete: 'email', type: 'email', placeholder: 'abebe@example.et' })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Truck className="size-5" /> Delivery</CardTitle>
              <CardDescription>We deliver within Addis Ababa in 2–3 days. The rider calls the phone above.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {saved.data && saved.data.length > 0 && (
                <div className="space-y-2">
                  <Label>Saved addresses</Label>
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
                        <span className="flex items-center gap-1.5 font-medium"><MapPin className="size-3.5" /> {a.label}{a.isDefault && <span className="text-xs font-normal text-muted-foreground">· default</span>}</span>
                        <span className="mt-1 block text-muted-foreground">{a.addressLine}, {a.city}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {field('address', 'Street, area and house / building', { autoComplete: 'street-address', placeholder: 'Bole, near Atlas, house 12' })}
              {field('city', 'City', { autoComplete: 'address-level2', placeholder: 'Addis Ababa' })}
              <div className="space-y-2">
                <Label htmlFor="notes">Notes for the rider <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Textarea id="notes" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Gate colour, landmark, best time to call…" aria-invalid={!!errors.notes} />
                {errors.notes && <p className="text-sm text-destructive">{errors.notes}</p>}
              </div>
              {isCustomer && chosen === null && (
                <label className="flex items-center justify-between gap-4 rounded-xl border p-3 text-sm">
                  <span>Save this address to my account</span>
                  <Switch checked={saveAddress} onCheckedChange={setSaveAddress} aria-label="Save this address" />
                </label>
              )}
            </CardContent>
          </Card>
        </form>

        <Card className="h-fit lg:sticky lg:top-24">
          <CardHeader>
            <CardTitle>Order summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {lines.map((l) => (
              <div key={l.productId} className="flex items-center gap-3">
                <ProductVisual categorySlug={l.categorySlug} imageUrl={l.imageUrl} name={l.name} className="size-12 shrink-0 rounded-lg" iconClassName="size-5" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.name}</p>
                  <p className="text-xs text-muted-foreground">Qty {l.quantity}</p>
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
                  aria-label="Discount code"
                  placeholder="Discount code"
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
                    <X /> Remove
                  </Button>
                ) : (
                  <Button type="submit" variant="outline" size="sm" className="h-9" disabled={!codeInput.trim() || applyCode.isPending}>
                    {applyCode.isPending ? <Loader2 className="animate-spin" /> : <Tag />} Apply
                  </Button>
                )}
              </div>
              {codeError && <p className="text-xs text-destructive">{codeError}</p>}
              {applied?.discountDescription && <p className="text-xs text-success">{applied.discountDescription}</p>}
            </form>
            <Separator />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{formatETB(subtotal)}</span>
            </div>
            {applied && discount > 0 && (
              <div className="flex justify-between text-sm text-success">
                <span>Discount ({applied.discountCode})</span>
                <span className="tabular-nums">−{formatETB(discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Delivery</span>
              <span className="tabular-nums">{quote.isLoading ? '…' : fee === 0 ? 'Free' : formatETB(fee)}</span>
            </div>
            {toFree > 0 && (
              <p className="rounded-lg bg-accent px-3 py-2 text-xs text-accent-foreground">
                Add {formatETB(toFree)} more for free delivery.
              </p>
            )}
            <div className="flex justify-between text-lg font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatETB(total)}</span>
            </div>
            <Button type="submit" form="checkout-form" size="lg" className="h-11 w-full text-base" disabled={busy || quote.isLoading}>
              {busy ? <><Loader2 className="animate-spin" /> Redirecting to BillPay…</> : <><Lock /> Pay {formatETB(total)} with BillPay</>}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              You’ll finish paying on BillPay’s secure page with Wallet, Bank or Card.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
