import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Camera, Loader2 } from 'lucide-react'
import { useRef } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { toast } from 'sonner'

import { ProblemThread } from '@/components/problem-thread'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { problemApi, type Problem } from '@/lib/dispute-api'
import { useSession } from '@/store/session'

/** /problems/:id: the buyer's or the seller's view of a reported problem. */
export function ProblemPage() {
  const id = Number(useParams().id)
  const session = useSession((s) => s.session)
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const q = useQuery({ queryKey: ['problem', id], queryFn: () => problemApi.get(id), enabled: !!session, retry: false })
  const set = (p: Problem) => qc.setQueryData(['problem', id], p)
  const send = useMutation({ mutationFn: (body: string) => problemApi.message(id, body), onSuccess: set, onError: (e) => toast.error(e.message) })
  const withdraw = useMutation({ mutationFn: () => problemApi.withdraw(id), onSuccess: (p) => { set(p); toast.success('Closed') }, onError: (e) => toast.error(e.message) })
  const photo = useMutation({ mutationFn: (f: File) => problemApi.addPhoto(id, f), onSuccess: set, onError: (e) => toast.error(e.message) })

  if (!session) return <Navigate to={`/login?next=/problems/${id}`} replace />
  const p = q.data
  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-6 sm:px-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        {p?.viewer === 'SELLER' ? <Link to="/seller/problems"><ArrowLeft /> Problems</Link> : <Link to={p ? `/orders/track?order=${p.orderNumber}` : '/account'}><ArrowLeft /> My order</Link>}
      </Button>
      <h1 className="text-2xl font-extrabold tracking-tight">{p?.viewer === 'SELLER' ? 'A buyer reported a problem' : 'Your problem report'}</h1>
      {q.isLoading && <Skeleton className="h-60 rounded-2xl" />}
      {q.isError && <p className="text-muted-foreground">This problem report isn't available.</p>}
      {p && (
        <>
          {p.viewer === 'SELLER' && p.status === 'OPEN' && (
            <p className="rounded-xl bg-market/10 p-3 text-sm">
              The money for this order stays held until it's settled. Answer the buyer here: offer a swap, a repair or a refund. If you can't agree, Sodo Gebeya decides.
            </p>
          )}
          <ProblemThread p={p} loadPhoto={(photoId) => problemApi.photo(id, photoId)} onSend={(b) => send.mutate(b)} sending={send.isPending} />
          <div className="flex flex-wrap gap-2">
            {p.canAddPhotos && (
              <>
                <Button variant="outline" size="sm" disabled={photo.isPending} onClick={() => input.current?.click()}>
                  {photo.isPending ? <Loader2 className="animate-spin" /> : <Camera />} Add a photo
                </Button>
                <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) photo.mutate(f); e.target.value = '' }} />
              </>
            )}
            {p.canWithdraw && (
              <Button variant="ghost" size="sm" disabled={withdraw.isPending}
                onClick={() => { if (window.confirm('Close this problem? Do this when it is sorted out with the seller.')) withdraw.mutate() }}>
                It's sorted out, close it
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** Seller → Problems: what buyers reported about my shop's orders. */
export function SellerProblemsPage() {
  const q = useQuery({ queryKey: ['seller-problems'], queryFn: problemApi.forMyShop })
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold">Problems reported by buyers</h2>
      <p className="text-sm text-muted-foreground">Answer quickly: the money for these orders stays held until each one is settled.</p>
      {q.data?.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No problems reported. Well done.</p>}
      <ul className="space-y-2">
        {q.data?.map((r) => (
          <li key={r.id}>
            <Link to={`/problems/${r.id}`} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 text-sm hover:bg-muted/50">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Order {r.parcelNumber} · {r.buyerName}</span>
                <span className="block text-xs text-muted-foreground">{r.reason.replaceAll('_', ' ').toLowerCase()} · {new Date(r.createdAt).toLocaleDateString('en-GB')}</span>
              </span>
              <span className={r.status === 'OPEN' ? 'rounded-full bg-market/20 px-2.5 py-0.5 text-xs font-semibold text-market-deep' : 'text-xs text-muted-foreground'}>
                {r.status === 'OPEN' ? (r.sellerRepliedAt ? 'Open · you answered' : 'Needs your answer') : r.status.replaceAll('_', ' ').toLowerCase()}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
