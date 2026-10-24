import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { ReviewItem } from '@/components/reviews'
import { Button } from '@/components/ui/button'
import type { Page } from '@/lib/api'
import { staffRequest } from '@/lib/chat-admin-api'
import type { Review } from '@/lib/review-api'
import { PageHeader, Pager } from './shared'

const reviewsAdminApi = {
  list: (hidden: string, page: number) => staffRequest<Page<Review>>(`/reviews?${hidden ? `hidden=${hidden}&` : ''}page=${page}`),
  hide: (id: number, hidden: boolean, reason?: string) =>
    staffRequest<Review>(`/reviews/${id}/hide`, { method: 'POST', body: JSON.stringify({ hidden, reason }) }),
}

/** Staff: every review; hide abusive or fake ones (they stop counting in ratings). */
export function AdminReviewsPage() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState<'' | 'false' | 'true'>('')
  const [page, setPage] = useState(0)
  const { data } = useQuery({ queryKey: ['admin-reviews', filter, page], queryFn: () => reviewsAdminApi.list(filter, page), placeholderData: keepPreviousData })
  const hide = useMutation({
    mutationFn: ({ id, hidden }: { id: number; hidden: boolean }) =>
      reviewsAdminApi.hide(id, hidden, hidden ? window.prompt('Why hide it? (shown to the shop)') ?? undefined : undefined),
    onSuccess: (r) => {
      toast.success(r.hidden ? 'Review hidden' : 'Review shown again')
      qc.invalidateQueries({ queryKey: ['admin-reviews'] })
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <>
      <PageHeader title="Reviews" description="Reviews come only from buyers who received the item. Hide abusive or off-topic ones; hidden reviews don't count in ratings." />
      <div className="flex gap-2">
        {([['', 'All'], ['false', 'Visible'], ['true', 'Hidden']] as const).map(([k, label]) => (
          <Button key={label} size="sm" variant={filter === k ? 'default' : 'outline'} aria-pressed={filter === k} onClick={() => { setFilter(k); setPage(0) }}>{label}</Button>
        ))}
      </div>
      <ul className="space-y-3">
        {data?.content.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No reviews yet.</p>}
        {data?.content.map((r) => (
          <ReviewItem key={r.id} r={r} showProduct>
            <Button size="sm" variant="outline" disabled={hide.isPending} onClick={() => hide.mutate({ id: r.id, hidden: !r.hidden })}>
              {r.hidden ? <><Eye /> Show again</> : <><EyeOff /> Hide</>}
            </Button>
          </ReviewItem>
        ))}
      </ul>
      {data && <Pager page={page} totalPages={data.totalPages} total={data.totalElements} size={data.size} onPage={setPage} />}
    </>
  )
}
