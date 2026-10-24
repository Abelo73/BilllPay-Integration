import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, Camera, Loader2, Store, Truck } from 'lucide-react'
import { Link, Navigate, useNavigate } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ApiError } from '@/lib/api'
import { sellerApi } from '@/lib/seller-api'
import { useSession } from '@/store/session'
import { ShopForm } from './shop-form'

const STEPS = [
  { icon: Store, title: 'Open your shop', text: 'A shop, or just you selling a few things. Free.' },
  { icon: BadgeCheck, title: 'We check it', text: 'Sodo Gebeya approves new sellers, usually within a day. You get an SMS.' },
  { icon: Camera, title: 'Add your products', text: 'Photos, price and stock from your phone. Start while you wait.' },
  { icon: Truck, title: 'Sell and deliver', text: 'Buyers pay with BillPay; you see the order, pack it and send it.' },
]

function HowItWorks() {
  return (
    <ol className="grid gap-3 sm:grid-cols-2">
      {STEPS.map((s, i) => (
        <li key={s.title} className="flex gap-3 rounded-2xl border bg-card p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <s.icon className="size-5" />
          </span>
          <span>
            <span className="block text-sm font-bold">{i + 1}. {s.title}</span>
            <span className="block text-sm text-muted-foreground">{s.text}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

/** /sell: what selling means, then the open-a-shop form. Sellers who already have a shop go to /seller. */
export function SellPage() {
  const session = useSession((s) => s.session)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const signedIn = !!session && session.user.role === 'CUSTOMER'
  const shop = useQuery({
    queryKey: ['seller-shop'],
    queryFn: sellerApi.shop,
    enabled: signedIn,
    retry: false,
  })
  const open = useMutation({
    mutationFn: sellerApi.open,
    onSuccess: (s) => {
      qc.setQueryData(['seller-shop'], s)
      toast.success('Shop opened. Add your first products while we check it.')
      navigate('/seller', { replace: true })
    },
    onError: (e) => toast.error(e.message),
  })

  if (shop.data) return <Navigate to="/seller" replace />
  const noShop = shop.error instanceof ApiError && shop.error.code === 'NO_SHOP'

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6 sm:py-12">
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Sell on Sodo Gebeya</h1>
        <p className="text-muted-foreground">Reach buyers across Wolaita Sodo without opening a second shop.</p>
      </div>
      <HowItWorks />

      {!session && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
            <p className="flex-1 text-sm">Sign in or create a free account first. It takes a minute with your phone number.</p>
            <div className="flex gap-2">
              <Button asChild variant="outline"><Link to="/login?next=/sell">Sign in</Link></Button>
              <Button asChild><Link to="/register?next=/sell">Create account</Link></Button>
            </div>
          </CardContent>
        </Card>
      )}
      {session && !signedIn && (
        <p className="rounded-xl bg-muted p-4 text-sm">Staff accounts can't sell. Sign in with a customer account.</p>
      )}
      {signedIn && shop.isLoading && <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />}
      {signedIn && noShop && (
        <Card>
          <CardContent className="space-y-1 p-5 sm:p-6">
            <h2 className="pb-3 text-lg font-bold">Your shop</h2>
            <ShopForm
              defaultPhone={session.user.phone}
              submitLabel="Open my shop"
              pending={open.isPending}
              onSubmit={(input) => open.mutate(input)}
            />
          </CardContent>
        </Card>
      )}
      {signedIn && shop.error && !noShop && (
        <p className="text-sm text-destructive">Couldn't load your shop: {shop.error.message}</p>
      )}
    </div>
  )
}
