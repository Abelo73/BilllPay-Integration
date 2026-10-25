import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Check, ListChecks, Loader2, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { catalogApi, isAdmin, type CategoryRow } from '@/lib/admin-api'
import { categoryTree } from '@/lib/specs-api'
import { cn } from '@/lib/utils'
import { PageHeader } from './shared'

const selectClass = 'h-8 rounded-lg border bg-background px-2 text-sm'

type TreeRow = CategoryRow & { label: string; depth: number }

function Row({ c, mains, canUp, canDown, onMove }: { c: TreeRow; mains: CategoryRow[]; canUp: boolean; canDown: boolean; onMove: (dir: -1 | 1) => void }) {
  const qc = useQueryClient()
  const editable = isAdmin()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(c.name)
  const update = useMutation({
    mutationFn: (body: { name?: string; active?: boolean; parentId?: number; mainCategory?: boolean }) => catalogApi.updateCategory(c.id, body),
    onSuccess: (rows) => {
      qc.setQueryData(['admin-categories'], rows)
      setEditing(false)
    },
    onError: (e) => toast.error(e.message),
  })
  const isMain = c.depth === 0
  return (
    <div className={cn('flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-b-0', !isMain && 'bg-muted/30 pl-10')}>
      {editable && (
        <div className="flex flex-col">
          <Button size="icon-xs" variant="ghost" aria-label="Move up" disabled={!canUp} onClick={() => onMove(-1)}><ArrowUp /></Button>
          <Button size="icon-xs" variant="ghost" aria-label="Move down" disabled={!canDown} onClick={() => onMove(1)}><ArrowDown /></Button>
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
          <p className={cn('flex items-center gap-2', isMain ? 'font-semibold' : 'font-medium')}>
            {!isMain && <span className="text-muted-foreground">↳</span>}
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
      <Button asChild size="sm" variant="outline">
        <Link to={`/admin/categories/${c.id}/fields`}><ListChecks /> Fields{c.fieldCount > 0 && ` (${c.fieldCount})`}</Link>
      </Button>
      {editable && (
        <select
          aria-label={`Where ${c.name} sits`}
          className={selectClass}
          value={c.parentId ?? ''}
          disabled={update.isPending}
          onChange={(e) => update.mutate(e.target.value ? { parentId: Number(e.target.value) } : { mainCategory: true })}
        >
          <option value="">Main category</option>
          {mains.filter((m) => m.id !== c.id).map((m) => <option key={m.id} value={m.id}>Under {m.name}</option>)}
        </select>
      )}
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
  const [parent, setParent] = useState('')
  const { data } = useQuery({ queryKey: ['admin-categories'], queryFn: catalogApi.categories })
  const rows = categoryTree(data ?? [])
  const mains = (data ?? []).filter((c) => !c.parentId)
  const create = useMutation({
    mutationFn: () => catalogApi.createCategory(name, parent ? Number(parent) : null),
    onSuccess: (r) => { qc.setQueryData(['admin-categories'], r); setName(''); toast.success('Category added') },
    onError: (e) => toast.error(e.message),
  })
  const reorder = useMutation({
    mutationFn: catalogApi.reorderCategories,
    onSuccess: (r) => qc.setQueryData(['admin-categories'], r),
    onError: (e) => toast.error(e.message),
  })
  /** Moves a category up or down among its siblings (main categories, or the subcategories of one main category). */
  const move = (c: TreeRow, dir: -1 | 1) => {
    const siblings = rows.filter((x) => (x.parentId ?? null) === (c.parentId ?? null))
    const i = siblings.findIndex((x) => x.id === c.id)
    const other = siblings[i + dir]
    if (!other) return
    const ids = data!.map((x) => x.id)
    const a = ids.indexOf(c.id)
    const b = ids.indexOf(other.id)
    ;[ids[a], ids[b]] = [ids[b], ids[a]]
    reorder.mutate(ids)
  }
  const siblingsOf = (c: TreeRow) => rows.filter((x) => (x.parentId ?? null) === (c.parentId ?? null))

  return (
    <>
      <PageHeader
        title="Categories"
        description="Order here is the order in the store. Subcategories (Electronics → Mobile phones) have their own fields: brand, model, RAM, size… Hiding a category hides its products too."
      />
      {isAdmin() && (
        <form className="flex max-w-2xl flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate() }}>
          <Input placeholder="New category name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className="min-w-48 flex-1" />
          <select aria-label="Where it goes" value={parent} onChange={(e) => setParent(e.target.value)} className="h-9 rounded-lg border bg-background px-2 text-sm">
            <option value="">As a main category</option>
            {mains.map((m) => <option key={m.id} value={m.id}>Under {m.name}</option>)}
          </select>
          <Button type="submit" disabled={!name.trim() || create.isPending}>
            {create.isPending ? <Loader2 className="animate-spin" /> : <Plus />} Add
          </Button>
        </form>
      )}
      <Card>
        <CardContent className="p-0">
          {rows.map((c) => {
            const sib = siblingsOf(c)
            const i = sib.findIndex((x) => x.id === c.id)
            return <Row key={c.id} c={c} mains={mains} canUp={i > 0} canDown={i < sib.length - 1} onMove={(d) => move(c, d)} />
          })}
        </CardContent>
      </Card>
    </>
  )
}
