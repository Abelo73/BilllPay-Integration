import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Check, Loader2, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { catalogApi, isAdmin, type CategoryRow } from '@/lib/admin-api'
import { PageHeader } from './shared'

function Row({ c, index, total, onMove }: { c: CategoryRow; index: number; total: number; onMove: (from: number, to: number) => void }) {
  const qc = useQueryClient()
  const editable = isAdmin()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(c.name)
  const update = useMutation({
    mutationFn: (body: { name?: string; active?: boolean }) => catalogApi.updateCategory(c.id, body),
    onSuccess: (rows) => {
      qc.setQueryData(['admin-categories'], rows)
      setEditing(false)
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <div className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
      {editable && (
        <div className="flex flex-col">
          <Button size="icon-xs" variant="ghost" aria-label="Move up" disabled={index === 0} onClick={() => onMove(index, index - 1)}><ArrowUp /></Button>
          <Button size="icon-xs" variant="ghost" aria-label="Move down" disabled={index === total - 1} onClick={() => onMove(index, index + 1)}><ArrowDown /></Button>
        </div>
      )}
      <div className="min-w-0 flex-1">
        {editing ? (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); update.mutate({ name }) }}>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className="h-8 max-w-xs" />
            <Button size="sm" type="submit" disabled={update.isPending}>{update.isPending ? <Loader2 className="animate-spin" /> : <Check />} Save</Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => { setEditing(false); setName(c.name) }}>Cancel</Button>
          </form>
        ) : (
          <p className="flex items-center gap-2 font-medium">
            {c.name}
            {editable && <Button size="icon-xs" variant="ghost" aria-label="Rename" onClick={() => setEditing(true)}><Pencil /></Button>}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          /{c.slug} ·{' '}
          <Link to={`/admin/products?category=${c.id}`} className="hover:underline">
            {c.productCount} product{c.productCount === 1 ? '' : 's'} ({c.activeProductCount} in store)
          </Link>
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        {c.active ? 'Visible' : 'Hidden'}
        <Switch checked={c.active} disabled={!editable || update.isPending} onCheckedChange={(v) => update.mutate({ active: v })} />
      </label>
    </div>
  )
}

export function AdminCategoriesPage() {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const { data } = useQuery({ queryKey: ['admin-categories'], queryFn: catalogApi.categories })
  const create = useMutation({
    mutationFn: () => catalogApi.createCategory(name),
    onSuccess: (rows) => { qc.setQueryData(['admin-categories'], rows); setName(''); toast.success('Category added') },
    onError: (e) => toast.error(e.message),
  })
  const reorder = useMutation({
    mutationFn: catalogApi.reorderCategories,
    onSuccess: (rows) => qc.setQueryData(['admin-categories'], rows),
    onError: (e) => toast.error(e.message),
  })
  const move = (from: number, to: number) => {
    const ids = data!.map((c) => c.id)
    const [x] = ids.splice(from, 1)
    ids.splice(to, 0, x)
    reorder.mutate(ids)
  }

  return (
    <>
      <PageHeader title="Categories" description="Order here is the order in the store. Hiding a category hides its products from the store too." />
      {isAdmin() && (
        <form className="flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate() }}>
          <Input placeholder="New category name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          <Button type="submit" disabled={!name.trim() || create.isPending}>
            {create.isPending ? <Loader2 className="animate-spin" /> : <Plus />} Add
          </Button>
        </form>
      )}
      <Card>
        <CardContent className="p-0">
          {data?.map((c, i) => <Row key={c.id} c={c} index={i} total={data.length} onMove={move} />)}
        </CardContent>
      </Card>
    </>
  )
}
