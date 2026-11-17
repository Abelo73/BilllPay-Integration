import { ZoomPicture } from '@/components/zoom-picture'
import { useQuery } from '@tanstack/react-query'
import { MapPin } from 'lucide-react'
import { Link, useParams } from 'react-router'

import { Card, CardContent } from '@/components/ui/card'
import { api, ApiError } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { useT } from '@/lib/i18n'

/** /people/:id: what others see of a customer who switched their public profile on. */
export function PublicProfilePage() {
  const t = useT()
  const { id = '' } = useParams()
  const q = useQuery({ queryKey: ['person', id], queryFn: () => api.person(id), retry: false })
  if (q.isLoading) return <div className="mx-auto max-w-md px-4 py-12 text-center text-muted-foreground">{t('Loading…')}</div>
  if (q.error instanceof ApiError || !q.data) {
    return (
      <div className="mx-auto max-w-md space-y-3 px-4 py-16 text-center">
        <p className="text-lg font-semibold">{t('This profile is not public.')}</p>
        <Link to="/" className="text-sm font-semibold text-brand hover:underline">{t('Back to the store')}</Link>
      </div>
    )
  }
  const p = q.data
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <Card>
        <CardContent className="space-y-4 p-6 text-center">
          <ZoomPicture src={p.avatarUrl} alt={p.firstName}>
            <Avatar name={p.firstName} url={p.avatarUrl} size={112} />
          </ZoomPicture>
          <div>
            <h1 className="text-2xl font-bold">{p.firstName}</h1>
            {p.area && (
              <p className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="size-4" /> {p.area}</p>
            )}
          </div>
          {p.bio && <p className="text-sm leading-relaxed text-muted-foreground">{p.bio}</p>}
          <p className="text-xs text-muted-foreground">{t('Member since {date}', { date: formatDate(p.joinedAt) })}</p>
        </CardContent>
      </Card>
    </div>
  )
}

/** A picture, or the first letter on a coloured circle when there is none. */
export function Avatar({ name, url, size }: { name: string; url: string | null; size: number }) {
  return url ? (
    <img src={url} alt="" className="mx-auto shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      className="mx-auto grid shrink-0 place-items-center rounded-full bg-primary font-semibold text-primary-foreground"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      aria-hidden
    >
      {name[0]?.toUpperCase() ?? '?'}
    </span>
  )
}
