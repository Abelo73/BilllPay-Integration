import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, Loader2, MessageSquareReply, Star } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { formatDate } from '@/lib/format'
import { reviewApi, type Review, type Reviewable, type ReviewPage } from '@/lib/review-api'
import { cn } from '@/lib/utils'

/** Read-only stars, e.g. 4.3 → four full, one partly filled. */
export function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('inline-flex text-warning', className)} role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className="relative size-4">
          <Star className="absolute size-4 text-border" fill="currentColor" strokeWidth={0} />
          <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${Math.max(0, Math.min(1, value - i + 1)) * 100}%` }}>
            <Star className="size-4" fill="currentColor" strokeWidth={0} />
          </span>
        </span>
      ))}
    </span>
  )
}

function Summary({ data }: { data: ReviewPage }) {
  const { average, count, stars } = data.summary
  if (count === 0) return <p className="text-sm text-muted-foreground">No reviews yet. Reviews come only from buyers who received the item.</p>
  return (
    <div className="flex flex-wrap items-center gap-6 rounded-2xl border bg-card p-4">
      <div className="text-center">
        <p className="text-4xl font-extrabold tabular-nums">{average?.toFixed(1)}</p>
        <Stars value={average ?? 0} />
        <p className="mt-1 text-xs text-muted-foreground">{count} review{count === 1 ? '' : 's'}</p>
      </div>
      <div className="min-w-48 flex-1 space-y-1">
        {[5, 4, 3, 2, 1].map((s) => {
          const n = stars[String(s)] ?? 0
          return (
            <div key={s} className="flex items-center gap-2 text-xs">
              <span className="w-3 tabular-nums">{s}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-warning" style={{ width: `${count ? (n / count) * 100 : 0}%` }} />
              </span>
              <span className="w-6 text-right tabular-nums text-muted-foreground">{n}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ReviewItem({ r, showProduct = false, children }: { r: Review; showProduct?: boolean; children?: React.ReactNode }) {
  return (
    <li className="space-y-2 rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          {r.authorName}
          <span className="flex items-center gap-1 text-xs font-medium text-success"><BadgeCheck className="size-3.5" /> Verified purchase</span>
        </span>
        <Stars value={r.rating} />
      </div>
      {showProduct && r.productName && <p className="text-xs text-muted-foreground">{r.productName}</p>}
      {r.body && <p className="whitespace-pre-wrap text-sm leading-relaxed">{r.body}</p>}
      <p className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</p>
      {r.hidden && <p className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive">Hidden by staff{r.hiddenReason ? `: ${r.hiddenReason}` : ''}</p>}
      {r.sellerReply && (
        <div className="rounded-xl bg-muted/60 p-3 text-sm">
          <p className="mb-1 flex items-center gap-1 text-xs font-semibold"><MessageSquareReply className="size-3.5" /> Reply from the shop</p>
          <p className="whitespace-pre-wrap">{r.sellerReply}</p>
        </div>
      )}
      {children}
    </li>
  )
}

/** Reviews of a product or of a whole shop: summary, then the newest reviews. */
export function ReviewsSection({ productId, shopSlug, title = 'Reviews' }: { productId?: number; shopSlug?: string; title?: string }) {
  const [page, setPage] = useState(0)
  const { data } = useQuery({
    queryKey: ['reviews', productId ?? shopSlug, page],
    queryFn: () => (productId ? reviewApi.product(productId, page) : reviewApi.shop(shopSlug!, page)),
    placeholderData: keepPreviousData,
  })
  if (!data) return null
  return (
    <section aria-labelledby="reviews-title" className="space-y-4">
      <h2 id="reviews-title" className="text-xl font-bold">{title}</h2>
      <Summary data={data} />
      {data.reviews.content.length > 0 && (
        <ul className="space-y-3">
          {data.reviews.content.map((r) => <ReviewItem key={r.id} r={r} showProduct={!productId} />)}
        </ul>
      )}
      {data.reviews.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Newer</Button>
          <Button variant="outline" size="sm" disabled={page + 1 >= data.reviews.totalPages} onClick={() => setPage(page + 1)}>Older</Button>
        </div>
      )}
    </section>
  )
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div role="radiogroup" aria-label="Rating" className="flex gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={`${i} star${i === 1 ? '' : 's'}`}
          className="grid size-11 place-items-center rounded-lg hover:bg-muted"
          onClick={() => onChange(i)}
        >
          <Star className={cn('size-7', i <= value ? 'text-warning' : 'text-border')} fill="currentColor" strokeWidth={0} />
        </button>
      ))}
    </div>
  )
}

function WriteReview({ item, onClose }: { item: Reviewable; onClose: () => void }) {
  const qc = useQueryClient()
  const [rating, setRating] = useState(0)
  const [body, setBody] = useState('')
  const save = useMutation({
    mutationFn: () => reviewApi.create(item.orderItemId, rating, body),
    onSuccess: () => {
      toast.success('Thanks for your review!')
      qc.invalidateQueries({ queryKey: ['reviewable'] })
      qc.invalidateQueries({ queryKey: ['reviews'] })
      onClose()
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rate {item.productName}</DialogTitle>
          <DialogDescription>Order {item.orderNumber}. Your first name and last initial are shown with the review.</DialogDescription>
        </DialogHeader>
        <StarPicker value={rating} onChange={setRating} />
        <Textarea rows={4} maxLength={1000} placeholder="What did you like? Anything to improve? (optional)" value={body} onChange={(e) => setBody(e.target.value)} aria-label="Your review" />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Later</Button>
          <Button disabled={rating === 0 || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="animate-spin" />} Post review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** "Rate what you received": items from delivered orders that don't have a review yet. */
export function ToReview() {
  const { data } = useQuery({ queryKey: ['reviewable'], queryFn: reviewApi.reviewable })
  const [open, setOpen] = useState<Reviewable | null>(null)
  if (!data || data.length === 0) return null
  return (
    <section aria-labelledby="to-review" className="space-y-3 rounded-2xl border border-warning/50 bg-amber-soft/40 p-4">
      <h2 id="to-review" className="font-bold">Rate what you received</h2>
      <ul className="space-y-2">
        {data.map((i) => (
          <li key={i.orderItemId} className="flex items-center gap-3 rounded-xl bg-card p-2">
            {i.imageUrl ? <img src={i.imageUrl} alt="" className="size-12 rounded-lg object-cover" /> : <span className="size-12 rounded-lg bg-muted" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{i.productName}</span>
              <span className="text-xs text-muted-foreground">Delivered {formatDate(i.deliveredAt)}</span>
            </span>
            <Button size="sm" className="h-10" onClick={() => setOpen(i)}>
              <Star /> Rate
            </Button>
          </li>
        ))}
      </ul>
      {open && <WriteReview item={open} onClose={() => setOpen(null)} />}
    </section>
  )
}
