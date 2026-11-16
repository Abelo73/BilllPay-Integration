import { Heart } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router'

import { useFavourites } from '@/lib/favourite-api'
import { useT } from '@/lib/i18n'
import { recordInterest } from '@/lib/interests'
import { cn } from '@/lib/utils'

/** The heart: keep a listing in Favourites (guests are sent to sign in first). */
/** {@code product}: when given, saving it also counts for "For you" on the home page (on this device only). */
export function HeartButton({ productId, className, withLabel = false, product }: {
  productId: number
  className?: string
  withLabel?: boolean
  product?: { slug: string; categorySlug: string; categoryName: string; brand?: string }
}) {
  const t = useT()
  const fav = useFavourites()
  const navigate = useNavigate()
  const location = useLocation()
  const on = fav.has(productId)
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? t('Remove from favourites') : t('Save to favourites')}
      title={on ? t('Remove from favourites') : t('Save to favourites')}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!fav.signedIn) navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`)
        else {
          if (!on && product) recordInterest({ kind: 'save', category: product.categorySlug, categoryName: product.categoryName, brand: product.brand, productSlug: product.slug })
          fav.toggle(productId)
        }
      }}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-full transition active:scale-90',
        withLabel ? 'h-10 border px-4 text-sm font-semibold hover:bg-muted' : 'size-9 hover:bg-muted',
        on ? 'text-rose-600' : 'text-muted-foreground',
        className,
      )}
    >
      <Heart className={cn('size-5', on && 'fill-current')} />
      {withLabel && (on ? t('Saved') : t('Save'))}
    </button>
  )
}
