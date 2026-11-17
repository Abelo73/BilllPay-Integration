import { cn } from '@/lib/utils'

/** A round picture of a person or shop, or their initials when there is no picture. */
export function PersonAvatar({ name, url, className }: { name: string; url: string | null; className?: string }) {
  if (url) {
    return <img src={url} alt="" className={cn('shrink-0 rounded-full object-cover', className)} />
  }
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <span aria-hidden className={cn('grid shrink-0 place-items-center rounded-full bg-primary font-bold text-primary-foreground', className)}>
      {letters || '?'}
    </span>
  )
}
