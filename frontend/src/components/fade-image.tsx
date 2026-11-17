import { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'

/**
 * A picture that shows a soft shimmer while it loads, then fades in (a little zoom settles as it appears). If the
 * picture fails, the shimmer stays away and the box is left empty rather than showing a broken icon.
 */
export function FadeImage({
  src,
  alt,
  className,
  loading = 'lazy',
  ...rest
}: { src: string; alt: string; className?: string; loading?: 'lazy' | 'eager' } & Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt' | 'loading'>) {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading')
  // a new picture starts its own shimmer and fade
  useEffect(() => setState('loading'), [src])
  return (
    <img
      {...rest}
      src={src}
      alt={alt}
      loading={loading}
      data-loaded={state === 'loaded'}
      onLoad={() => setState('loaded')}
      onError={() => setState('failed')}
      className={cn(
        'img-fade',
        state === 'loading' && 'img-shimmer',
        state === 'failed' && 'invisible',
        className,
      )}
    />
  )
}
