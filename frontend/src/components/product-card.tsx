import { Plus } from 'lucide-react'
import { Link } from 'react-router'

import { ProductVisual } from '@/components/product-visual'
import { Button } from '@/components/ui/button'
import type { Product } from '@/lib/api'
import { formatETB } from '@/lib/format'
import { useCart } from '@/store/cart'

export function ProductCard({ product }: { product: Product }) {
  const add = useCart((s) => s.add)
  const soldOut = product.available <= 0
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card transition hover:-translate-y-0.5 hover:shadow-lg">
      <Link to={`/product/${product.slug}`} className="block overflow-hidden" tabIndex={-1} aria-hidden>
        <ProductVisual
          categorySlug={product.categorySlug}
          imageUrl={product.imageUrl}
          name={product.name}
          className="aspect-square w-full transition duration-500 group-hover:scale-[1.03]"
        />
      </Link>
      {product.featured && (
        <span className="absolute left-2 top-2 rounded-full bg-warning px-2 py-0.5 text-[11px] font-bold text-foreground dark:text-[#1A1F1C]">
          Featured
        </span>
      )}
      {soldOut ? (
        <span className="absolute right-2 top-2 rounded-full bg-card/95 px-2 py-0.5 text-[11px] font-bold">Sold out</span>
      ) : (
        product.lowStock && (
          <span className="absolute right-2 top-2 rounded-full bg-amber-soft px-2 py-0.5 text-[11px] font-bold text-amber-ink">
            Only {product.available} left
          </span>
        )
      )}
      <div className="flex flex-1 flex-col gap-1 p-3 sm:p-4">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{product.categoryName}</p>
        <Link to={`/product/${product.slug}`} className="line-clamp-2 text-sm font-semibold leading-snug hover:underline">
          {product.name}
        </Link>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="text-base font-extrabold tabular-nums">{formatETB(product.price)}</span>
          <Button
            size="icon"
            variant={soldOut ? 'outline' : 'default'}
            disabled={soldOut}
            onClick={() => add(product)}
            aria-label={soldOut ? `${product.name} is sold out` : `Add ${product.name} to cart`}
            className="size-9 shrink-0 rounded-xl"
          >
            <Plus />
          </Button>
        </div>
      </div>
    </div>
  )
}
