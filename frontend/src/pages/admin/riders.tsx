import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bike, Phone, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { isAdmin } from '@/lib/admin-api'
import { deliveryAdminApi, type RiderInput, type RiderRow } from '@/lib/delivery-api'
import { PageHeader } from './shared'

function RiderLine({ r, admin }: { r: RiderRow; admin: boolean }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<RiderInput>({ name: r.name, phone: r.phone, note: r.note ?? '' })
  const save = useMutation({
    mutationFn: (b: RiderInput) => deliveryAdminApi.updateRider(r.id, b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-riders'] }); setEditing(false); toast.success('Saved') },
    onError: (e) => toast.error(e.message),
  })
  if (editing) {
    return (
      <form className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_1fr_1.4fr_auto]" onSubmit={(e) => { e.preventDefault(); save.mutate(form) }}>
        <Input aria-label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Input aria-label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <Input aria-label="Note" value={form.note} placeholder="e.g. Bajaj, mornings" onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <span className="flex gap-1">
          <Button type="submit" size="sm" disabled={save.isPending}>Save</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        </span>
      </form>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="grid size-9 place-items-center rounded-full bg-accent text-primary"><Bike className="size-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-semibold">{r.name}{!r.active && <Badge variant="outline" className="bg-muted text-muted-foreground">off</Badge>}</span>
        <span className="block text-xs text-muted-foreground">{r.phone}{r.note && ` · ${r.note}`}</span>
      </span>
      <Button asChild size="sm" variant="outline"><a href={`tel:${r.phone}`}><Phone /> Call</a></Button>
      {admin && (
        <>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>
          <Button size="sm" variant="ghost" disabled={save.isPending} onClick={() => save.mutate({ active: !r.active })}>{r.active ? 'Switch off' : 'Switch on'}</Button>
        </>
      )}
    </div>
  )
}

/** Admin → Riders (M21): partner riders who deliver in Sodo. Pick one per parcel on the order page. */
export function AdminRidersPage() {
  const qc = useQueryClient()
  const admin = isAdmin()
  const { data } = useQuery({ queryKey: ['admin-riders'], queryFn: deliveryAdminApi.riders })
  const [form, setForm] = useState({ name: '', phone: '', note: '' })
  const add = useMutation({
    mutationFn: () => deliveryAdminApi.addRider(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-riders'] }); setForm({ name: '', phone: '', note: '' }); toast.success('Rider added') },
    onError: (e) => toast.error(e.message),
  })
  return (
    <>
      <PageHeader
        title="Riders"
        description="Partner riders who deliver in Sodo. Put a rider on a parcel from the order page; the buyer sees their name and can call once it's on the way."
      />
      {admin && (
        <form className="grid max-w-3xl gap-2 sm:grid-cols-[1fr_1fr_1.4fr_auto]" onSubmit={(e) => { e.preventDefault(); add.mutate() }}>
          <Input aria-label="Rider name" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input aria-label="Rider phone" placeholder="Phone, e.g. 0911 234 567" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input aria-label="Note" placeholder="Note (optional): Bajaj, mornings…" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <Button type="submit" disabled={!form.name.trim() || !form.phone.trim() || add.isPending}><Plus /> Add</Button>
        </form>
      )}
      <Card className="max-w-3xl">
        <CardContent className="divide-y p-0">
          {data?.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">No riders yet. Add the first one above.</p>}
          {data?.map((r) => <RiderLine key={r.id} r={r} admin={admin} />)}
        </CardContent>
      </Card>
    </>
  )
}
