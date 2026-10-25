import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Lock, MapPin, Minus, Plus, RotateCcw, Store, Truck } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { ChatWithSeller } from '@/components/chat-with-seller'
import { ContactSeller, SafetyTips } from '@/components/contact-seller'
import { ProductVisual } from '@/components/product-visual'
import { ReportListing } from '@/components/report-listing'
import { ReviewsSection } from '@/components/reviews'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { VerifiedBadge } from '@/components/verified-badge'
import { api, ApiError, CONDITION_LABEL } from '@/lib/api'
import { useFeatures } from '@/lib/features'
import { formatETB } from '@/lib/format'
import { MAX_QTY, useCart } from '@/store/cart'
import { NotFoundPage } from './not-found'

/** Main photo with clickable thumbnails; falls back to the category illustration when there are no photos. */
function Gallery({ name, categorySlug, images }: { name: string; categorySlug: string; images: { url: string; thumbUrl: string }[] }) {
  const [active, setActive] = useState(0)
  if (images.length === 0) {
    return <ProductVisual categorySlug={categorySlug} name={name} className="aspect-square w-full rounded-3xl" iconClassName="size-32" />
  }
  return (
    <div className="space-y-3">
      <img src={images[active].url} alt={name} className="aspect-square w-full rounded-3xl object-cover ring-1 ring-border" />
      {images.length > 1 && (
        <div className="flex gap-3">
          {images.map((img, i) => (
            <button
              key={img.url}
              type="button"
              aria-label={`Photo ${i + 1}`}
              onClick={() => setActive(i)}
              className={`overflow-hidden rounded-xl ring-2 transition ${i === active ? 'ring-brand' : 'ring-transparent opacity-70 hover:opacity-100'}`}
            >
              <img src={img.thumbUrl} alt="" className="size-20 object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ProductPage() {
  const features = useFeatures()
  const { slug = '' } = useParams()
  const [qty, setQty] = useState(1)
  const add = useCart((s) => s.add)
  const { data: p, isLoading, error } = useQuery({ queryKey: ['product', slug], queryFn: () => api.product(slug) })

  if (error instanceof ApiError && error.status === 404) return <NotFoundPage />

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-6">
        <Link to="/shop">
          <ChevronLeft /> Back to shop
        </Link>
      </Button>
      {isLoading || !p ? (
        <div className="grid gap-10 md:grid-cols-2">
          <Skeleton className="aspect-square rounded-3xl" />
          <div className="space-y-4">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      ) : (
        <div className="grid gap-10 md:grid-cols-2">
          <Gallery key={p.slug} name={p.name} categorySlug={p.categorySlug} images={p.images ?? []} />
          <div className="flex flex-col gap-6">
            <div className="space-y-3">
              <Link to={`/shop?category=${p.categorySlug}`} className="text-sm font-medium text-brand hover:underline">
                {p.categoryName}
              </Link>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{p.name}</h1>
              <p className="text-2xl font-semibold">{formatETB(p.price)}</p>
              {p.available > 0 ? (
                <Badge variant="secondary" className={p.lowStock ? 'bg-warning/90 text-foreground' : ''}>
                  {p.lowStock ? `Only ${p.available} left` : 'In stock'}
                </Badge>
              ) : (
                <Badge variant="destructive">Sold out</Badge>
              )}
              {(p.condition || p.negotiable || p.area) && (
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  {p.condition && <span className="font-semibold text-foreground">{CONDITION_LABEL[p.condition]}</span>}
                  {p.negotiable && <span>Price negotiable</span>}
                  {p.area && <span className="flex items-center gap-1"><MapPin className="size-3.5" /> {p.area}</span>}
                </p>
              )}
            </div>
            <p className="text-muted-foreground text-pretty">{p.description}</p>

            {p.seller ? (
              <Link to={`/shops/${p.seller.slug}`} className="flex items-center gap-3 rounded-2xl border bg-card p-4 transition hover:border-primary/40">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Store className="size-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-muted-foreground">Sold by</span>
                  <span className="flex items-center gap-1.5 text-sm font-bold">
                    <span className="truncate">{p.seller.name}</span>
                    {p.seller.verified && <VerifiedBadge />}
                  </span>
                  {p.seller.area && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3" /> {p.seller.area}</span>
                  )}
                </span>
                <span className="flex items-center text-sm font-semibold text-primary">Shop <ChevronRight className="size-4" /></span>
              </Link>
            ) : (
              <p className="text-xs text-muted-foreground">Sold and delivered by Sodo Gebeya</p>
            )}

            {!features.payments ? (
              <div className="space-y-3">
                <ContactSeller productId={p.id} slug={p.slug} />
                {p.seller && <ChatWithSeller productId={p.id} slug={p.slug} className="h-12 w-full text-base" />}
                <SafetyTips />
              </div>
            ) : (
            <>
            <div className="flex items-center gap-3">
              <div className="flex items-center rounded-lg border">
                <Button variant="ghost" size="icon" aria-label="Decrease" onClick={() => setQty((q) => Math.max(1, q - 1))}>
                  <Minus />
                </Button>
                <span className="w-10 text-center tabular-nums">{qty}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Increase"
                  onClick={() => setQty((q) => Math.min(Math.min(MAX_QTY, p.available), q + 1))}
                >
                  <Plus />
                </Button>
              </div>
              <Button size="lg" className="h-10 flex-1" disabled={p.available <= 0} onClick={() => add(p, qty)}>
                Add to cart
              </Button>
            </div>
            {p.seller && <ChatWithSeller productId={p.id} slug={p.slug} className="-mt-3 w-full" />}

            <ul className="space-y-3 rounded-2xl border bg-muted/30 p-5 text-sm">
              <li className="flex items-center gap-3"><Lock className="size-4 text-brand" /> Secure payment with BillPay Wallet, Bank or Card</li>
              <li className="flex items-center gap-3"><Truck className="size-4 text-brand" /> Delivery in Wolaita Sodo</li>
              <li className="flex items-center gap-3"><RotateCcw className="size-4 text-brand" /> Refunds back to your BillPay method</li>
            </ul>
            </>
            )}
            {p.seller && <ReportListing productId={p.id} slug={p.slug} />}
          </div>
        </div>
      )}
      {p && (
        <div className="mt-12 max-w-3xl">
          <ReviewsSection productId={p.id} title="Reviews from buyers" />
        </div>
      )}
    </div>
  )
}
