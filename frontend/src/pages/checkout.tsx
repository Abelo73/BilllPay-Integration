import { useMutation } from '@tanstack/react-query'
import { Loader2, Lock, ShoppingBag } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'

import { ProductVisual } from '@/components/product-visual'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { api, ApiError } from '@/lib/api'
import { formatETB, orderContact } from '@/lib/format'
import { cartTotals, useCart } from '@/store/cart'

const schema = z.object({
  name: z.string().trim().min(2, 'Enter your full name').max(200),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{9,20}$/, 'Enter a valid phone number, e.g. 0911 234 567'),
  email: z.email('Enter a valid email address'),
})

type Form = z.infer<typeof schema>
type Errors = Partial<Record<keyof Form, string>>

export function CheckoutPage() {
  const { lines, clear } = useCart()
  const { subtotal } = cartTotals(lines)
  const navigate = useNavigate()
  const [form, setForm] = useState<Form>({ name: '', phone: '', email: '' })
  const [errors, setErrors] = useState<Errors>({})

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
      if (err instanceof ApiError && err.code === 'VALIDATION_FAILED') {
        setErrors((err.body.errors as Record<string, string>) ?? {})
      }
      toast.error(err.message)
    },
  })

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
      return
    }
    setErrors({})
    checkout.mutate({
      items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      customer: parsed.data,
    })
  }

  const field = (key: keyof Form, label: string, props: React.ComponentProps<'input'>) => (
    <div className="space-y-2">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        aria-invalid={!!errors[key]}
        className="h-10"
        {...props}
      />
      {errors[key] && <p className="text-sm text-destructive">{errors[key]}</p>}
    </div>
  )

  const busy = checkout.isPending || checkout.isSuccess

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Checkout</h1>
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_400px]">
        <Card>
          <CardHeader>
            <CardTitle>Contact details</CardTitle>
            <CardDescription>BillPay uses these to send your payment request and receipt.</CardDescription>
          </CardHeader>
          <CardContent>
            <form id="checkout-form" onSubmit={submit} className="space-y-5" noValidate>
              {field('name', 'Full name', { autoComplete: 'name', placeholder: 'Abebe Kebede' })}
              {field('phone', 'Phone number', { autoComplete: 'tel', inputMode: 'tel', placeholder: '0911 234 567' })}
              {field('email', 'Email', { autoComplete: 'email', type: 'email', placeholder: 'abebe@example.et' })}
            </form>
          </CardContent>
        </Card>

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
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Delivery</span>
              <span>Free</span>
            </div>
            <div className="flex justify-between text-lg font-semibold">
              <span>Total</span>
              <span>{formatETB(subtotal)}</span>
            </div>
            <Button type="submit" form="checkout-form" size="lg" className="h-11 w-full text-base" disabled={busy}>
              {busy ? <><Loader2 className="animate-spin" /> Redirecting to BillPay…</> : <><Lock /> Pay with BillPay</>}
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
