import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { isAdmin } from '@/lib/admin-api'
import { trustAdminApi, type AreaRow } from '@/lib/trust-api'
import { PageHeader } from './shared'

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
      <PageHeader title="Areas" description="Neighbourhoods of Wolaita Sodo offered when sellers post a listing. Sellers can still type another one." />
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
