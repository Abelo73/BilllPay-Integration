import { Plus } from 'lucide-react'
import { Link } from 'react-router'

import { ProductVisual } from '@/components/product-visual'
import { Button } from '@/components/ui/button'
import { VerifiedBadge } from '@/components/verified-badge'
import { CONDITION_LABEL, type Product } from '@/lib/api'
import { formatETB } from '@/lib/format'
import { useFeatures } from '@/lib/features'
import { useT } from '@/lib/i18n'
import { useCart } from '@/store/cart'

export function ProductCard({ product }: { product: Product }) {
  const t = useT()
  const add = useCart((s) => s.add)
  const soldOut = product.available <= 0
  const { payments } = useFeatures()
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
      {product.boosted ? (
        <span className="absolute left-2 top-2 rounded-full bg-market px-2 py-0.5 text-[11px] font-bold text-[#13201A]">{t('Boosted')}</span>
      ) : (
        product.featured && (
          <span className="absolute left-2 top-2 rounded-full bg-warning px-2 py-0.5 text-[11px] font-bold text-foreground dark:text-[#13201A]">
            {t('Featured')}
          </span>
        )
      )}
      {soldOut ? (
        <span className="absolute right-2 top-2 rounded-full bg-card/95 px-2 py-0.5 text-[11px] font-bold">{t('Sold out')}</span>
      ) : (
        product.lowStock && (
          <span className="absolute right-2 top-2 rounded-full bg-amber-soft px-2 py-0.5 text-[11px] font-bold text-amber-ink">
            {t('Only {n} left', { n: product.available })}
          </span>
        )
      )}
      <div className="flex flex-1 flex-col gap-1 p-3 sm:p-4">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {product.condition && product.condition !== 'NEW' ? `${t(CONDITION_LABEL[product.condition])} · ` : ''}{product.categoryName}
        </p>
        <Link to={`/product/${product.slug}`} className="line-clamp-2 text-sm font-semibold leading-snug hover:underline">
          {product.name}
        </Link>
        {product.seller && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="truncate">{product.seller.name}</span>
            {product.seller.verified && <VerifiedBadge compact className="px-1" />}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="text-base font-extrabold tabular-nums">{formatETB(product.price)}</span>
          {payments && <Button
            size="icon"
            variant={soldOut ? 'outline' : 'default'}
            disabled={soldOut}
            onClick={() => add(product)}
            aria-label={soldOut ? t('{name} is sold out', { name: product.name }) : t('Add {name} to cart', { name: product.name })}
            className="size-9 shrink-0 rounded-xl"
          >
            <Plus />
          </Button>}
        </div>
      </div>
    </div>
  )
}
