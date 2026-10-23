import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router'

import { ProductVisual } from '@/components/product-visual'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { formatETB } from '@/lib/format'
import { cartTotals, useCart } from '@/store/cart'

export function CartSheet() {
  const { lines, open, setOpen, setQuantity, remove } = useCart()
  const { count, subtotal } = cartTotals(lines)
  const navigate = useNavigate()

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Your cart</SheetTitle>
          <SheetDescription>{count === 0 ? 'Nothing here yet.' : `${count} item${count > 1 ? 's' : ''}`}</SheetDescription>
        </SheetHeader>

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
            <div className="grid size-16 place-items-center rounded-full bg-muted">
              <ShoppingBag className="size-7 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Browse the shop and add something you love.</p>
            <Button asChild onClick={() => setOpen(false)}>
              <Link to="/shop">Start shopping</Link>
            </Button>
          </div>
        ) : (
          <div className="flex-1 space-y-4 overflow-y-auto px-4">
            {lines.map((l) => (
              <div key={l.productId} className="flex gap-3">
                <ProductVisual categorySlug={l.categorySlug} imageUrl={l.imageUrl} name={l.name} className="size-16 shrink-0 rounded-lg" iconClassName="size-6" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <Link to={`/product/${l.slug}`} onClick={() => setOpen(false)} className="truncate text-sm font-medium hover:underline">
                    {l.name}
                  </Link>
                  <span className="text-sm text-muted-foreground">{formatETB(l.price)}</span>
                  <div className="mt-1 flex items-center gap-1">
                    <Button size="icon-xs" variant="outline" aria-label="Decrease" onClick={() => setQuantity(l.productId, l.quantity - 1)}>
                      <Minus />
                    </Button>
                    <span className="w-7 text-center text-sm tabular-nums">{l.quantity}</span>
                    <Button size="icon-xs" variant="outline" aria-label="Increase" onClick={() => setQuantity(l.productId, l.quantity + 1)}>
                      <Plus />
                    </Button>
                    <Button size="icon-xs" variant="ghost" className="ml-auto" aria-label="Remove" onClick={() => remove(l.productId)}>
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {lines.length > 0 && (
          <SheetFooter>
            <Separator className="mb-2" />
            <div className="flex items-center justify-between font-medium">
              <span>Subtotal</span>
              <span>{formatETB(subtotal)}</span>
            </div>
            <p className="text-xs text-muted-foreground">Final amount is confirmed at checkout.</p>
            <Button
              size="lg"
              onClick={() => {
                setOpen(false)
                navigate('/checkout')
              }}
            >
              Checkout
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
