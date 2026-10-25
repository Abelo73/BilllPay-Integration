import { Minus, Plus, ShoppingBag, Store, Trash2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router'

import { ProductVisual } from '@/components/product-visual'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { formatETB } from '@/lib/format'
import { cartTotals, useCart } from '@/store/cart'
import { useSession } from '@/store/session'

export function CartSheet() {
  const { lines, open, setOpen, setQuantity, remove } = useCart()
  const { count, subtotal } = cartTotals(lines)
  const navigate = useNavigate()
  const signedIn = useSession((s) => !!s.session)
  // grouped by seller (design S4); Sodo Gebeya's own items first, like the parcels at checkout
  const groups: { key: string; name: string; lines: typeof lines }[] = []
  for (const l of [...lines].sort((a, b) => Number(!!a.seller) - Number(!!b.seller))) {
    const key = l.seller?.slug ?? ''
    let g = groups.find((x) => x.key === key)
    if (!g) groups.push((g = { key, name: l.seller?.name ?? 'Sodo Gebeya', lines: [] }))
    g.lines.push(l)
  }

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
          <div className="flex-1 space-y-5 overflow-y-auto px-4">
            {groups.length > 1 && (
              <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                From {groups.length} sellers: each delivers their own items, with its own delivery fee.
              </p>
            )}
            {groups.map((g) => (
              <section key={g.key} className="space-y-3" aria-label={`From ${g.name}`}>
                {groups.length > 1 && (
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Store className="size-3.5" /> {g.name}
                  </p>
                )}
            {g.lines.map((l) => (
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
              </section>
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
            <p className="text-xs text-muted-foreground">
              Final amount is confirmed at checkout.{!signedIn && ' You’ll sign in first; your cart is kept.'}
            </p>
            <Button
              size="lg"
              onClick={() => {
                setOpen(false)
                navigate(signedIn ? '/checkout' : '/login?next=/checkout')
              }}
            >
              {signedIn ? 'Checkout' : 'Sign in to check out'}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
