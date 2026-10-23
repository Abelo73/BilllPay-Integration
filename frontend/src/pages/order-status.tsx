import { Search } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'

import { OrderStatusPanel } from '@/components/order-status-panel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { orderContact } from '@/lib/format'
import { useSession } from '@/store/session'

/** Asks for order number and phone when they aren't known, then shows the order. */
function OrderLookup({ initialOrder, onFound }: { initialOrder: string; onFound: (order: string, phone: string) => void }) {
  const [order, setOrder] = useState(initialOrder)
  const [phone, setPhone] = useState('')
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Track your order</CardTitle>
        <CardDescription>Enter the order number from your confirmation and the phone you used at checkout.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (order.trim() && phone.trim()) onFound(order.trim().toUpperCase(), phone.trim())
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="order">Order number</Label>
            <Input id="order" className="h-10 font-mono" placeholder="TS-20261022-00001" value={order} onChange={(e) => setOrder(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone number</Label>
            <Input id="phone" className="h-10" inputMode="tel" placeholder="0911 234 567" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </div>
          <Button type="submit" size="lg" className="h-10 w-full">
            <Search /> Find order
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

/** Shared by /checkout/return, /checkout/cancelled and /orders/track. */
export function OrderStatusPage({ cancelled = false }: { cancelled?: boolean }) {
  const [params, setParams] = useSearchParams()
  const order = params.get('order') ?? ''
  const signedIn = useSession((s) => !!s.session)
  const [savedPhone, setPhone] = useState(() => (order ? orderContact.phone(order) : null))
  // Signed-in customers can open their own orders without the phone; the backend checks ownership.
  const phone = savedPhone ?? (signedIn ? '' : null)

  return (
    <div className="px-4 py-12 sm:px-6">
      {order && phone !== null ? (
        <OrderStatusPanel key={order + phone} orderNumber={order} phone={phone} cancelled={cancelled} />
      ) : (
        <OrderLookup
          initialOrder={order}
          onFound={(o, p) => {
            orderContact.save(o, p)
            setPhone(p)
            setParams({ order: o }, { replace: true })
          }}
        />
      )}
    </div>
  )
}
