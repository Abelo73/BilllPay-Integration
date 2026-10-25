import { useQuery } from '@tanstack/react-query'
import { Check, Loader2 } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { optionsFor, specsApi, type SpecField, type Specs, type SpecValue } from '@/lib/specs-api'

const selectClass =
  'h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30'

/**
 * The category's detail fields on the listing form (brand, model, RAM, storage, chip, bed size, ...).
 * The model list follows the chosen brand; "Other" lets sellers type what isn't listed.
 */
export function SpecFields({
  categoryId,
  value,
  onChange,
  errors = {},
  disabled = false,
}: {
  categoryId: number | null
  value: Specs
  onChange: (next: Specs) => void
  /** from the server: { "specs.brand": "Choose brand." } */
  errors?: Record<string, string>
  disabled?: boolean
}) {
  const t = useT()
  const fields = useQuery({
    queryKey: ['category-fields', categoryId],
    queryFn: () => specsApi.byId(categoryId!),
    enabled: !!categoryId,
    staleTime: 5 * 60_000,
  })
  if (!categoryId) return null
  if (fields.isLoading) return <Loader2 className="size-4 animate-spin text-muted-foreground" />
  const list = fields.data?.fields ?? []
  if (list.length === 0) return null

  const set = (f: SpecField, v: SpecValue | undefined) => {
    const next: Specs = { ...value }
    if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) delete next[f.key]
    else next[f.key] = v
    // a new brand clears the model that belonged to the old one
    for (const d of list) if (d.dependsOn === f.key && next[d.key] !== undefined && value[f.key] !== v) delete next[d.key]
    onChange(next)
  }

  return (
    <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
      <legend className="mb-1 text-sm font-semibold">{t('Details')}</legend>
      {list.map((f) => (
        <FieldInput key={f.key} field={f} specs={value} onSet={(v) => set(f, v)} error={errors[`specs.${f.key}`]} />
      ))}
    </fieldset>
  )
}

function FieldInput({ field: f, specs, onSet, error }: { field: SpecField; specs: Specs; onSet: (v: SpecValue | undefined) => void; error?: string }) {
  const t = useT()
  const id = `spec-${f.key}`
  const v = specs[f.key]
  const wide = f.type === 'MULTI' || f.type === 'TEXT'
  const label = (
    <Label htmlFor={id}>
      {f.label}
      {f.unit && f.type === 'NUMBER' && <span className="font-normal text-muted-foreground"> ({f.unit})</span>}
      {f.required && <span className="text-destructive"> *</span>}
    </Label>
  )
  let input: React.ReactNode
  if (f.type === 'SELECT') {
    const options = optionsFor(f, specs)
    const waiting = f.dependsOn && !specs[f.dependsOn]
    if (options && !f.allowOther) {
      input = (
        <select id={id} className={selectClass} value={String(v ?? '')} onChange={(e) => onSet(e.target.value)} aria-invalid={!!error}>
          <option value="">{t('Choose…')}</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )
    } else {
      // a list to pick from, and typing allowed ("Other")
      input = (
        <>
          <Input id={id} list={`${id}-list`} className="h-10" value={String(v ?? '')} onChange={(e) => onSet(e.target.value)} aria-invalid={!!error}
            placeholder={waiting ? t('Choose {field} first, or type', { field: labelOf(f.dependsOn!) }) : options ? t('Choose or type…') : t('Type…')} autoComplete="off" />
          {options && <datalist id={`${id}-list`}>{options.map((o) => <option key={o} value={o} />)}</datalist>}
        </>
      )
    }
  } else if (f.type === 'MULTI') {
    const picked = Array.isArray(v) ? v : []
    const options = optionsFor(f, specs) ?? []
    input = (
      <div id={id} className="flex flex-wrap gap-2" role="group" aria-label={f.label}>
        {options.map((o) => {
          const on = picked.includes(o)
          return (
            <button key={o} type="button" aria-pressed={on} onClick={() => onSet(on ? picked.filter((x) => x !== o) : [...picked, o])}
              className={cn('inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm', on ? 'border-primary bg-primary/10 font-medium text-primary' : 'hover:bg-muted')}>
              {on && <Check className="size-3.5" />}{o}
            </button>
          )
        })}
      </div>
    )
  } else if (f.type === 'YES_NO') {
    input = (
      <div id={id} className="flex gap-2" role="group" aria-label={f.label}>
        {([[true, 'Yes'], [false, 'No']] as const).map(([b, l]) => (
          <button key={l} type="button" aria-pressed={v === b} onClick={() => onSet(v === b ? undefined : b)}
            className={cn('h-10 flex-1 rounded-lg border px-3 text-sm font-medium', v === b ? 'border-2 border-primary bg-primary/5 text-primary' : 'hover:bg-muted')}>
            {t(l)}
          </button>
        ))}
      </div>
    )
  } else if (f.type === 'NUMBER') {
    input = <Input id={id} type="number" inputMode="decimal" min={0} step="any" className="h-10" value={v === undefined ? '' : String(v)}
      onChange={(e) => onSet(e.target.value)} aria-invalid={!!error} />
  } else {
    input = <Input id={id} maxLength={200} className="h-10" value={String(v ?? '')} onChange={(e) => onSet(e.target.value)} aria-invalid={!!error} />
  }
  return (
    <div className={cn('space-y-1.5', wide && 'sm:col-span-2')}>
      {label}
      {input}
      {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

const labelOf = (key: string) => key.replaceAll('_', ' ')
