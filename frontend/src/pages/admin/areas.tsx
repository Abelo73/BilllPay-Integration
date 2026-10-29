import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Eye, EyeOff, MapPin, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { isAdmin } from '@/lib/admin-api'
import { deliveryAdminApi, type AreaFeeRow } from '@/lib/delivery-api'
import { trustAdminApi, type AreaRow } from '@/lib/trust-api'
import { PageHeader } from './shared'

/** Delivery fee to one area (M21): empty = the standard fee. Saved on Enter or when leaving the box. */
function FeeCell({ area, admin, onSaved }: { area: AreaFeeRow; admin: boolean; onSaved: (list: AreaRow[]) => void }) {
  const [value, setValue] = useState(area.deliveryFee === null ? '' : String(area.deliveryFee))
  const save = useMutation({
    mutationFn: (fee: number | null) => deliveryAdminApi.setAreaFee(area.id, fee),
    onSuccess: (list) => { onSaved(list); toast.success(`Delivery fee for ${area.name} saved`) },
    onError: (e) => toast.error(e.message),
  })
  if (!admin) return <span className="text-xs text-muted-foreground">{area.deliveryFee === null ? 'standard fee' : `${area.deliveryFee} birr`}</span>
  const commit = () => {
    const fee = value.trim() === '' ? null : Number(value)
    if (fee !== null && (!Number.isFinite(fee) || fee < 0)) return toast.error('Enter a fee of 0 or more, or leave it empty for the standard fee.')
    if (fee === area.deliveryFee) return
    save.mutate(fee)
  }
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      Delivery
      <Input
        className="h-8 w-24"
        inputMode="decimal"
        placeholder="standard"
        aria-label={`Delivery fee to ${area.name}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
      />
      birr
    </label>
  )
}

/** Where the area is on the tracking map: paste "lat, lng" from Google Maps (right-click → the numbers). Empty = centre of Sodo. */
function PointCell({ area, admin, onSaved }: { area: AreaFeeRow; admin: boolean; onSaved: (list: AreaRow[]) => void }) {
  const shown = area.lat != null && area.lng != null ? `${area.lat}, ${area.lng}` : ''
  const [value, setValue] = useState(shown)
  const save = useMutation({
    mutationFn: (p: { lat: number | null; lng: number | null }) => deliveryAdminApi.setAreaPoint(area.id, p.lat, p.lng),
    onSuccess: (list) => { onSaved(list); toast.success(`Map point for ${area.name} saved`) },
    onError: (e) => toast.error(e.message),
  })
  if (!admin) return <span className="hidden text-xs text-muted-foreground sm:inline">{shown || 'no map point'}</span>
  const commit = () => {
    const text = value.trim()
    if (text === shown) return
    if (text === '') return save.mutate({ lat: null, lng: null })
    const m = text.match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/)
    const lat = m ? Number(m[1]) : NaN
    const lng = m ? Number(m[2]) : NaN
    if (!m || Math.abs(lat) > 90 || Math.abs(lng) > 180) return toast.error('Paste the point as "latitude, longitude", e.g. 6.856, 37.757')
    save.mutate({ lat, lng })
  }
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <MapPin className="size-3.5" />
      <Input
        className="h-8 w-40 font-mono text-xs"
        placeholder="6.856, 37.757"
        aria-label={`Map point of ${area.name}`}
        title="Where this area is on the order tracking map. In Google Maps, right-click the place and click the numbers to copy them."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
      />
    </label>
  )
}

/** Admin → Areas: the neighbourhoods of Sodo suggested to sellers (and later used in search filters). */
export function AdminAreasPage() {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const { data } = useQuery({ queryKey: ['admin-areas'], queryFn: trustAdminApi.areas })
  const saved = (list: AreaRow[]) => { qc.setQueryData(['admin-areas'], list); qc.invalidateQueries({ queryKey: ['areas'] }) }
  const run = useMutation({ mutationFn: (fn: () => Promise<AreaRow[]>) => fn(), onSuccess: saved, onError: (e) => toast.error(e.message) })
  const admin = isAdmin()
  const move = (i: number, d: number) => {
    const ids = data!.map((a) => a.id)
    const [x] = ids.splice(i, 1)
    ids.splice(i + d, 0, x)
    run.mutate(() => trustAdminApi.reorderAreas(ids))
  }
  return (
    <>
      <PageHeader title="Areas" description="Neighbourhoods of Wolaita Sodo: offered when sellers post a listing, and picked by buyers at checkout. Give an area its own delivery fee, or leave it empty for the standard fee (0 = free). The map point places the area on the buyer's delivery tracking map." />
      {admin && (
        <form
          className="flex max-w-md gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) run.mutate(() => trustAdminApi.addArea(name.trim()), { onSuccess: () => setName('') })
          }}
        >
          <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gebeya sefer" aria-label="New area" />
          <Button type="submit" disabled={!name.trim() || run.isPending}><Plus /> Add</Button>
        </form>
      )}
      <Card className="max-w-3xl">
        <CardContent className="divide-y p-0">
          {data?.map((a, i) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span className="min-w-32 flex-1 text-sm font-medium">{a.name}</span>
              <FeeCell key={`${a.id}-${(a as AreaFeeRow).deliveryFee}`} area={a as AreaFeeRow} admin={admin} onSaved={saved} />
              <PointCell key={`p${a.id}-${(a as AreaFeeRow).lat}-${(a as AreaFeeRow).lng}`} area={a as AreaFeeRow} admin={admin} onSaved={saved} />
              {!a.active && <Badge variant="outline" className="bg-muted text-muted-foreground">hidden</Badge>}
              {admin && (
                <>
                  <Button size="icon-sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Move down" disabled={i === data.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label={a.active ? 'Hide' : 'Show'} onClick={() => run.mutate(() => trustAdminApi.updateArea(a.id, { active: !a.active }))}>
                    {a.active ? <EyeOff /> : <Eye />}
                  </Button>
                </>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  )
}
