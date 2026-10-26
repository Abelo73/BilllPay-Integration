import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus } from 'lucide-react'
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
      <PageHeader title="Areas" description="Neighbourhoods of Wolaita Sodo: offered when sellers post a listing, and picked by buyers at checkout. Give an area its own delivery fee, or leave it empty for the standard fee (0 = free)." />
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
      <Card className="max-w-2xl">
        <CardContent className="divide-y p-0">
          {data?.map((a, i) => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex-1 text-sm font-medium">{a.name}</span>
              <FeeCell key={`${a.id}-${(a as AreaFeeRow).deliveryFee}`} area={a as AreaFeeRow} admin={admin} onSaved={saved} />
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
