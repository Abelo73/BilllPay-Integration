import { Heart } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router'

import { useFavourites } from '@/lib/favourite-api'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** The heart: keep a listing in Favourites (guests are sent to sign in first). */
export function HeartButton({ productId, className, withLabel = false }: { productId: number; className?: string; withLabel?: boolean }) {
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
        else fav.toggle(productId)
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
