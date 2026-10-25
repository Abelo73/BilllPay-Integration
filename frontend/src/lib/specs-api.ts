import { request } from '@/lib/api'

/** Details a category asks for: brand, model (depends on brand), RAM, storage, chip, bed size, ... */
export type SpecType = 'SELECT' | 'MULTI' | 'NUMBER' | 'TEXT' | 'YES_NO'

export type SpecField = {
  id: number
  categoryId: number
  /** comes from the main category (e.g. Warranty for all Electronics) */
  inherited: boolean
  key: string
  label: string
  type: SpecType
  unit: string | null
  /** a list, or (with dependsOn) the list per answer of that field: { Samsung: [...], Apple: [...] } */
  options: string[] | Record<string, string[]> | null
  dependsOn: string | null
  allowOther: boolean
  required: boolean
  filterable: boolean
  position: number
  active: boolean
  help: string | null
}

export type SpecValue = string | number | boolean | string[]
export type Specs = Record<string, SpecValue>
export type SpecLine = { key: string; label: string; value: string }
export type Facet = { key: string; label: string; type: SpecType; values: { value: string; count: number }[] }

export type CategoryFields = {
  category: { id: number; name: string; slug: string; parentId: number | null }
  fields: SpecField[]
  facets: Facet[]
}

export const SPEC_TYPE_LABEL: Record<SpecType, string> = {
  SELECT: 'Pick one from a list',
  MULTI: 'Pick several from a list',
  NUMBER: 'Number',
  TEXT: 'Short text',
  YES_NO: 'Yes / no',
}

export const specsApi = {
  byId: (categoryId: number) => request<CategoryFields>(`/categories/id/${categoryId}/fields`),
  bySlug: (slug: string, facets = false) => request<CategoryFields>(`/categories/${encodeURIComponent(slug)}/fields?facets=${facets}`),
}

/** The list for this field given the answers so far (models of the chosen brand), or null for free typing. */
export function optionsFor(f: SpecField, specs: Specs): string[] | null {
  if (!f.options) return null
  if (Array.isArray(f.options)) return f.options
  const parent = f.dependsOn ? specs[f.dependsOn] : undefined
  if (parent === undefined || parent === '') return null
  const hit = Object.entries(f.options).find(([k]) => k.toLowerCase() === String(parent).toLowerCase())
  return hit ? hit[1] : null
}

/** "Electronics › Mobile phones": categories sorted with each subcategory under its main one. */
export function categoryTree<T extends { id: number; name: string; parentId?: number | null }>(list: T[]) {
  const mains = list.filter((c) => !c.parentId || !list.some((p) => p.id === c.parentId))
  const out: (T & { label: string; depth: number })[] = []
  for (const m of mains) {
    out.push({ ...m, label: m.name, depth: 0 })
    for (const s of list.filter((c) => c.parentId === m.id)) out.push({ ...s, label: `${m.name} › ${s.name}`, depth: 1 })
  }
  return out
}
