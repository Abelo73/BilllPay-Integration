import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowLeft, ArrowUp, Loader2, Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { catalogApi, isAdmin, type FieldInput } from '@/lib/admin-api'
import { SPEC_TYPE_LABEL, type SpecField, type SpecType } from '@/lib/specs-api'
import { PageHeader } from './shared'

const selectClass = 'h-9 w-full rounded-lg border bg-background px-2 text-sm'
const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)

/** Admin → Categories → Fields: what sellers fill in for this category, and what shoppers filter by. */
export function AdminCategoryFieldsPage() {
  const id = Number(useParams().categoryId)
  const qc = useQueryClient()
  const editable = isAdmin()
  const categories = useQuery({ queryKey: ['admin-categories'], queryFn: catalogApi.categories })
  const fields = useQuery({ queryKey: ['admin-fields', id], queryFn: () => catalogApi.fields(id) })
  const [editing, setEditing] = useState<SpecField | 'new' | null>(null)
  const cat = categories.data?.find((c) => c.id === id)
  const parent = categories.data?.find((c) => c.id === cat?.parentId)
  const own = (fields.data ?? []).filter((f) => !f.inherited)
  const inherited = (fields.data ?? []).filter((f) => f.inherited)
  const set = (rows: SpecField[]) => {
    qc.setQueryData(['admin-fields', id], rows)
    qc.invalidateQueries({ queryKey: ['admin-categories'] })
    qc.invalidateQueries({ queryKey: ['category-fields'] })
  }
  const reorder = useMutation({ mutationFn: (ids: number[]) => catalogApi.reorderFields(id, ids), onSuccess: set, onError: (e) => toast.error(e.message) })
  const remove = useMutation({
    mutationFn: (f: SpecField) => catalogApi.deleteField(id, f.id),
    onSuccess: (r) => { set(r); toast.success('Field removed') },
    onError: (e) => toast.error(e.message),
  })
  const toggle = useMutation({
    mutationFn: (f: SpecField) => catalogApi.updateField(id, f.id, { active: !f.active }),
    onSuccess: set,
    onError: (e) => toast.error(e.message),
  })
  const move = (i: number, d: -1 | 1) => {
    const ids = own.map((f) => f.id)
    ;[ids[i], ids[i + d]] = [ids[i + d], ids[i]]
    reorder.mutate(ids)
  }

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit"><Link to="/admin/categories"><ArrowLeft /> Categories</Link></Button>
      <PageHeader
        title={cat ? `${parent ? `${parent.name} › ` : ''}${cat.name}: fields` : 'Fields'}
        description="What sellers fill in when they list here (brand, model, RAM, storage, size…). Mark a field “filter” to let shoppers filter by it."
        actions={editable && <Button onClick={() => setEditing('new')}><Plus /> Add field</Button>}
      />
      {editing && (
        <FieldEditor
          categoryId={id}
          field={editing === 'new' ? null : editing}
          parents={(fields.data ?? []).filter((f) => f.type === 'SELECT' && (editing === 'new' || f.key !== editing.key))}
          onDone={(rows) => { if (rows) set(rows); setEditing(null) }}
        />
      )}
      <Card>
        <CardContent className="p-0">
          {fields.isLoading && <Loader2 className="m-4 size-5 animate-spin text-muted-foreground" />}
          {fields.data && own.length === 0 && <p className="p-6 text-sm text-muted-foreground">No fields yet. Add the details sellers should give, like Brand or Size.</p>}
          {own.map((f, i) => (
            <div key={f.id} className="flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-b-0">
              {editable && (
                <div className="flex flex-col">
                  <Button size="icon-xs" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
                  <Button size="icon-xs" variant="ghost" aria-label="Move down" disabled={i === own.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
                </div>
              )}
              <FieldSummary f={f} />
              {editable && (
                <>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    {f.active ? 'On' : 'Off'}
                    <Switch checked={f.active} onCheckedChange={() => toggle.mutate(f)} />
                  </label>
                  <Button size="sm" variant="outline" onClick={() => setEditing(f)}><Pencil /> Edit</Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`Remove ${f.label}`} className="text-destructive"
                    onClick={() => { if (window.confirm(`Remove "${f.label}"? Listings keep their answers, but they stop showing.`)) remove.mutate(f) }}>
                    <Trash2 />
                  </Button>
                </>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
      {inherited.length > 0 && parent && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Also asked here, from {parent.name}</CardTitle>
            <CardDescription>Edit these on <Link className="underline" to={`/admin/categories/${parent.id}/fields`}>{parent.name}</Link>; every subcategory shares them.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {inherited.map((f) => <div key={f.id} className="flex"><FieldSummary f={f} /></div>)}
          </CardContent>
        </Card>
      )}
    </>
  )
}

function FieldSummary({ f }: { f: SpecField }) {
  const count = !f.options ? 0 : Array.isArray(f.options) ? f.options.length : Object.values(f.options).reduce((n, l) => n + l.length, 0)
  return (
    <div className="min-w-0 flex-1">
      <p className="flex flex-wrap items-center gap-1.5 font-medium">
        {f.label}
        {f.unit && <span className="text-xs text-muted-foreground">({f.unit})</span>}
        {f.required && <Badge variant="secondary">required</Badge>}
        {f.filterable && <Badge variant="outline">filter</Badge>}
        {!f.active && <Badge variant="outline" className="text-muted-foreground">off</Badge>}
      </p>
      <p className="text-xs text-muted-foreground">
        {SPEC_TYPE_LABEL[f.type]}
        {count > 0 && ` · ${count} choices`}
        {f.dependsOn && ` · list depends on ${f.dependsOn}`}
        {f.allowOther && ' · “Other” allowed'}
      </p>
    </div>
  )
}

type Draft = {
  label: string
  type: SpecType
  unit: string
  help: string
  dependsOn: string
  optionsText: string
  /** per answer of the parent field: Samsung → "Galaxy A15\nGalaxy S24" */
  dependent: Record<string, string>
  allowOther: boolean
  required: boolean
  filterable: boolean
}

function draftOf(f: SpecField | null): Draft {
  return {
    label: f?.label ?? '',
    type: f?.type ?? 'SELECT',
    unit: f?.unit ?? '',
    help: f?.help ?? '',
    dependsOn: f?.dependsOn ?? '',
    optionsText: Array.isArray(f?.options) ? f.options.join('\n') : '',
    dependent: f?.options && !Array.isArray(f.options) ? Object.fromEntries(Object.entries(f.options).map(([k, v]) => [k, v.join('\n')])) : {},
    allowOther: f?.allowOther ?? false,
    required: f?.required ?? false,
    filterable: f?.filterable ?? false,
  }
}

function FieldEditor({ categoryId, field, parents, onDone }: {
  categoryId: number
  field: SpecField | null
  parents: SpecField[]
  onDone: (rows?: SpecField[]) => void
}) {
  const [d, setD] = useState<Draft>(() => draftOf(field))
  const [newKey, setNewKey] = useState('')
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))
  const list = d.type === 'SELECT' || d.type === 'MULTI'
  const parent = parents.find((p) => p.key === d.dependsOn)
  const parentValues = [...new Set([...(Array.isArray(parent?.options) ? parent.options : []), ...Object.keys(d.dependent)])]

  const save = useMutation({
    mutationFn: () => {
      const body: FieldInput = {
        label: d.label,
        type: d.type,
        unit: d.type === 'NUMBER' ? d.unit : '',
        help: d.help,
        dependsOn: list && d.type === 'SELECT' ? d.dependsOn : '',
        options: !list ? null : d.dependsOn && d.type === 'SELECT'
          ? Object.fromEntries(Object.entries(d.dependent).map(([k, v]) => [k, lines(v)]).filter(([, v]) => v.length))
          : lines(d.optionsText),
        allowOther: d.allowOther,
        required: d.required,
        filterable: d.filterable,
      }
      return field ? catalogApi.updateField(categoryId, field.id, body) : catalogApi.addField(categoryId, body)
    },
    onSuccess: (rows) => { toast.success(field ? 'Field saved' : 'Field added'); onDone(rows) },
    onError: (e) => toast.error(e.message),
  })

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="text-base">{field ? `Edit “${field.label}”` : 'New field'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
          <div className="space-y-1.5">
            <Label htmlFor="f-label">Name</Label>
            <Input id="f-label" required maxLength={80} value={d.label} onChange={(e) => set('label', e.target.value)} placeholder="e.g. Storage" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-type">Kind of answer</Label>
            <select id="f-type" className={selectClass} value={d.type} onChange={(e) => set('type', e.target.value as SpecType)}>
              {(Object.keys(SPEC_TYPE_LABEL) as SpecType[]).map((t) => <option key={t} value={t}>{SPEC_TYPE_LABEL[t]}</option>)}
            </select>
          </div>
          {d.type === 'NUMBER' && (
            <div className="space-y-1.5">
              <Label htmlFor="f-unit">Unit</Label>
              <Input id="f-unit" maxLength={16} value={d.unit} onChange={(e) => set('unit', e.target.value)} placeholder="GB, inch, mAh, cm…" />
            </div>
          )}
          {d.type === 'SELECT' && (
            <div className="space-y-1.5">
              <Label htmlFor="f-dep">The list depends on</Label>
              <select id="f-dep" className={selectClass} value={d.dependsOn} onChange={(e) => set('dependsOn', e.target.value)}>
                <option value="">Nothing (one list)</option>
                {parents.map((p) => <option key={p.key} value={p.key}>{p.label} (a list per {p.label.toLowerCase()})</option>)}
              </select>
            </div>
          )}
          {list && !(d.type === 'SELECT' && d.dependsOn) && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="f-opts">Choices, one per line</Label>
              <Textarea id="f-opts" rows={6} value={d.optionsText} onChange={(e) => set('optionsText', e.target.value)} placeholder={'64 GB\n128 GB\n256 GB'} />
            </div>
          )}
          {d.type === 'SELECT' && d.dependsOn && (
            <div className="space-y-3 sm:col-span-2">
              <p className="text-sm font-medium">Choices for each {parent?.label.toLowerCase() ?? d.dependsOn}, one per line</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {parentValues.map((v) => (
                  <div key={v} className="space-y-1">
                    <Label htmlFor={`dep-${v}`} className="text-xs">{v}</Label>
                    <Textarea id={`dep-${v}`} rows={4} value={d.dependent[v] ?? ''} onChange={(e) => set('dependent', { ...d.dependent, [v]: e.target.value })} />
                  </div>
                ))}
              </div>
              <div className="flex max-w-sm gap-2">
                <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder={`Another ${parent?.label.toLowerCase() ?? 'value'}…`} className="h-8" />
                <Button type="button" size="sm" variant="outline" disabled={!newKey.trim()} onClick={() => { set('dependent', { ...d.dependent, [newKey.trim()]: '' }); setNewKey('') }}>
                  <Plus /> Add
                </Button>
              </div>
            </div>
          )}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="f-help">Hint for sellers (optional)</Label>
            <Input id="f-help" maxLength={200} value={d.help} onChange={(e) => set('help', e.target.value)} placeholder="e.g. Settings → About phone shows it." />
          </div>
          <div className="grid gap-2 sm:col-span-2 sm:grid-cols-3">
            {list && <Toggle label="Allow “Other”" note="Sellers can type a value that isn't listed" on={d.allowOther} set={(v) => set('allowOther', v)} />}
            <Toggle label="Required" note="Sellers must answer" on={d.required} set={(v) => set('required', v)} />
            <Toggle label="Filter" note="Shoppers can filter by it" on={d.filterable} set={(v) => set('filterable', v)} />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={save.isPending}>{save.isPending ? <Loader2 className="animate-spin" /> : <Save />} {field ? 'Save' : 'Add field'}</Button>
            <Button type="button" variant="ghost" onClick={() => onDone()}><X /> Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function Toggle({ label, note, on, set }: { label: string; note: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{note}</span>
      </span>
      <Switch checked={on} onCheckedChange={set} />
    </label>
  )
}
