import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Database, Loader2, Trash2, Upload } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { isAdmin } from '@/lib/admin-api'
import { staffRequest } from '@/lib/chat-admin-api'
import { PageHeader } from './shared'

type Status = { listingsInFile: number; shopsInFile: number; listingsLoaded: number; listingsVisible: number; shopsLoaded: number }
type LoadResult = { listingsAdded: number; listingsRestored: number; shopsAdded: number; categoriesAdded: number }
type RemoveResult = { listingsDeleted: number; listingsHidden: number; shopsDeleted: number; shopsClosed: number }

const demoApi = {
  status: () => staffRequest<Status>('/demo-data'),
  load: () => staffRequest<LoadResult>('/demo-data', { method: 'POST', body: '{}' }),
  remove: () => staffRequest<RemoveResult>('/demo-data', { method: 'DELETE' }),
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border p-4">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

/** Admin → Demo data: fill the shop with test listings (with photos) in every category, and take them away again. */
export function AdminDemoDataPage() {
  const qc = useQueryClient()
  const admin = isAdmin()
  const [confirmRemove, setConfirmRemove] = useState(false)
  const status = useQuery({ queryKey: ['admin-demo-data'], queryFn: demoApi.status })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-demo-data'] })
    qc.invalidateQueries({ queryKey: ['products'] })
    qc.invalidateQueries({ queryKey: ['categories'] })
  }
  const load = useMutation({
    mutationFn: demoApi.load,
    onSuccess: (r) => {
      refresh()
      toast.success(`Added ${r.listingsAdded} listings, ${r.shopsAdded} shops, ${r.categoriesAdded} categories${r.listingsRestored ? `; ${r.listingsRestored} shown again` : ''}`)
    },
    onError: (e) => toast.error(e.message),
  })
  const remove = useMutation({
    mutationFn: demoApi.remove,
    onSuccess: (r) => {
      refresh()
      setConfirmRemove(false)
      toast.success(`Deleted ${r.listingsDeleted} listings and ${r.shopsDeleted} shops${r.listingsHidden ? `; ${r.listingsHidden} were ordered or chatted about, so they're hidden instead` : ''}`)
    },
    onError: (e) => toast.error(e.message),
  })
  const s = status.data
  return (
    <>
      <PageHeader
        title="Demo data"
        description="Test listings for trying the shop: 13 made-up Sodo shops and about 170 listings with photos in every category (laptops, phones, TVs, furniture, clothes, shoes, food, beauty, kids, sports, bikes, books). Everything is marked “demo-” and can be removed in one click."
      />
      <div className="grid max-w-3xl gap-3 sm:grid-cols-4">
        <Stat label="listings in the demo set" value={s?.listingsInFile ?? '…'} />
        <Stat label="loaded now" value={s?.listingsLoaded ?? '…'} />
        <Stat label="visible in the shop" value={s?.listingsVisible ?? '…'} />
        <Stat label="demo shops open" value={s ? `${s.shopsLoaded} / ${s.shopsInFile}` : '…'} />
      </div>
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Database className="size-5" /> Test listings</CardTitle>
          <CardDescription>
            Loading is safe to press again: it only adds what's missing. The demo sellers can't sign in.
            Removing deletes the demo listings and shops; any that were ordered, chatted about or reviewed are hidden instead, so order history stays complete.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button disabled={!admin || load.isPending} onClick={() => load.mutate()}>
            {load.isPending ? <Loader2 className="animate-spin" /> : <Upload />} Load demo data
          </Button>
          {confirmRemove ? (
            <>
              <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
                {remove.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />} Yes, remove all demo data
              </Button>
              <Button variant="ghost" onClick={() => setConfirmRemove(false)}>Keep it</Button>
            </>
          ) : (
            <Button variant="outline" disabled={!admin || !s?.listingsLoaded} onClick={() => setConfirmRemove(true)}>
              <Trash2 /> Remove demo data
            </Button>
          )}
          {s && s.listingsVisible > 0 && (
            <Button asChild variant="link"><Link to="/shop" target="_blank">See them in the shop →</Link></Button>
          )}
          {!admin && <p className="w-full text-xs text-muted-foreground">Only admins can load or remove demo data.</p>}
        </CardContent>
      </Card>
    </>
  )
}
