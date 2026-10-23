import { Plus } from 'lucide-react'
import { Link } from 'react-router'

import { ProductVisual } from '@/components/product-visual'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Product } from '@/lib/api'
import { formatETB } from '@/lib/format'
import { useCart } from '@/store/cart'

export function ProductCard({ product }: { product: Product }) {
  const add = useCart((s) => s.add)
  const soldOut = product.available <= 0
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card transition hover:-translate-y-0.5 hover:shadow-lg">
      <Link to={`/product/${product.slug}`} className="block">
        <ProductVisual
          categorySlug={product.categorySlug}
          imageUrl={product.imageUrl}
          name={product.name}
          className="aspect-[4/3] w-full transition duration-500 group-hover:scale-[1.03]"
        />
      </Link>
      {product.featured && <Badge className="absolute left-3 top-3">Featured</Badge>}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{product.categoryName}</p>
        <Link to={`/product/${product.slug}`} className="line-clamp-1 font-medium hover:underline">
          {product.name}
        </Link>
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="font-semibold">{formatETB(product.price)}</span>
          <Button size="sm" variant={soldOut ? 'outline' : 'default'} disabled={soldOut} onClick={() => add(product)}>
            {soldOut ? 'Sold out' : <><Plus /> Add</>}
          </Button>
        </div>
      </div>
    </div>
  )
}
