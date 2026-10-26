import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  GripVertical,
  ImagePlus,
  Loader2,
  Minus,
  Plus,
  Save,
  Star,
  Trash2,
} from 'lucide-react'
import { createContext, useContext, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { SpecFields } from '@/components/spec-fields'
import { catalogApi, isAdmin, type ChangeRow, type ProductDetail, type ProductInput } from '@/lib/admin-api'
import { categoryTree, type Specs } from '@/lib/specs-api'
import type { ItemCondition, Page } from '@/lib/api'
import { publicTrustApi, trustAdminApi } from '@/lib/trust-api'
import { formatDate, formatETB } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { StockBadge } from './products'
import { PageHeader } from './shared'

const MAX_BYTES = 5 * 1024 * 1024
const TYPES = ['image/jpeg', 'image/png', 'image/webp']
const ACTION_LABEL: Record<string, string> = {
  CREATED: 'Created',
  UPDATED: 'Edited',
  STOCK_ADJUSTED: 'Stock',
  HIDDEN: 'Hidden',
  SHOWN: 'Shown',
  DUPLICATED: 'Duplicated',
  IMAGE_ADDED: 'Photo added',
  IMAGE_REMOVED: 'Photo removed',
  IMAGES_REORDERED: 'Photos reordered',
  BLOCKED: 'Taken down',
  UNBLOCKED: 'Put back',
}

/** The calls the editor needs: the admin's catalogApi, or the seller's sellerCatalog (only their own products). */
export type CatalogClient = {
  product: (id: number) => Promise<ProductDetail>
  create: (body: ProductInput) => Promise<ProductDetail>
  update: (id: number, body: ProductInput) => Promise<ProductDetail>
  setVisible: (id: number, active: boolean) => Promise<ProductDetail>
  adjustStock: (id: number, delta: number, reason: string) => Promise<ProductDetail>
  duplicate: (id: number) => Promise<ProductDetail>
  changes: (id: number) => Promise<Page<ChangeRow>>
  removeImage: (id: number, imageId: number) => Promise<ProductDetail>
  reorderImages: (id: number, ids: number[]) => Promise<ProductDetail>
  uploadImage: (id: number, file: File) => Promise<ProductDetail>
  categories: () => Promise<{ id: number; name: string; active?: boolean; parentId?: number | null }[]>
}

export type EditorConfig = {
  client: CatalogClient
  editable: boolean
  /** List page; product pages live under it */
  basePath: string
  /** Prefix of the react-query keys, so admin and seller caches never mix */
  keyPrefix: string
  /** Seller mode: no URL slug or "featured" (Sodo Gebeya decides what's featured) */
  seller?: boolean
}

const EditorContext = createContext<EditorConfig | null>(null)

function useEditor() {
  const cfg = useContext(EditorContext)
  if (!cfg) throw new Error('ProductEditor config missing')
  return cfg
}

type FormState = {
  name: string
  slug: string
  description: string
  categoryId: string
  price: string
  stock: string
  lowStockThreshold: string
  featured: boolean
  active: boolean
  /** '' = not set (new goods from a shop) */
  condition: '' | ItemCondition
  negotiable: boolean
  area: string
  /** answers to the category's detail fields (brand, RAM, ...) */
  specs: Specs
}

function initialForm(d?: ProductDetail): FormState {
  return {
    name: d?.product.name ?? '',
    slug: d?.product.slug ?? '',
    description: d?.description ?? '',
    categoryId: d ? String(d.product.categoryId) : '',
    price: d ? String(d.product.price) : '',
    stock: '0',
    lowStockThreshold: d ? String(d.product.lowStockThreshold) : '5',
    featured: d?.product.featured ?? false,
    active: d?.product.active ?? true,
    condition: d?.product.condition ?? '',
    negotiable: d?.product.negotiable ?? false,
    area: d?.product.area ?? '',
    specs: d?.specs ?? {},
  }
}

function DetailsForm({ detail, onSaved }: { detail?: ProductDetail; onSaved: (d: ProductDetail) => void }) {
  const t = useT()
  const { editable, client, keyPrefix, seller } = useEditor()
  const isNew = !detail
  const [form, setForm] = useState<FormState>(() => initialForm(detail))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const categories = useQuery({ queryKey: [`${keyPrefix}-categories`], queryFn: client.categories })
  const areas = useQuery({ queryKey: ['areas'], queryFn: publicTrustApi.areas, staleTime: 10 * 60_000 })
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  const save = useMutation({
    mutationFn: () => {
      const body: ProductInput = {
        name: form.name,
        slug: form.slug || undefined,
        description: form.description,
        categoryId: Number(form.categoryId),
        price: Number(form.price),
        lowStockThreshold: Number(form.lowStockThreshold || 0),
        featured: form.featured,
        active: form.active,
        condition: form.condition || null,
        negotiable: form.negotiable,
        area: form.area,
        specs: form.specs,
        ...(isNew ? { stock: Number(form.stock || 0) } : {}),
      }
      return isNew ? client.create(body) : client.update(detail.product.id, body)
    },
    onSuccess: onSaved,
    onError: (e) => {
      const body = (e as { body?: { errors?: Record<string, string> } }).body
      setErrors(body?.errors ?? {})
      toast.error(e.message)
    },
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!form.name.trim()) next.name = 'Enter a name'
    if (!form.categoryId) next.categoryId = 'Choose a category'
    if (!(Number(form.price) > 0)) next.price = 'Price must be more than 0'
    setErrors(next)
    if (Object.keys(next).length === 0) save.mutate()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('Details')}</CardTitle>
        <CardDescription>{t("Shown on the store's product page. Old orders keep the name and price they were bought at.")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form id="product-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <fieldset disabled={!editable} className="contents">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">{t('Name')}</Label>
              <Input id="name" value={form.name} onChange={(e) => set('name', e.target.value)} aria-invalid={!!errors.name} maxLength={200} />
              {errors.name && <p className="text-sm text-destructive">{t(errors.name)}</p>}
            </div>
            {!seller && <div className="space-y-2">
              <Label htmlFor="slug">{t('URL slug')}</Label>
              <Input id="slug" className="font-mono text-xs" placeholder={t('made from the name')} value={form.slug} onChange={(e) => set('slug', e.target.value)} />
              <p className="text-xs text-muted-foreground">/product/{form.slug || '…'}</p>
            </div>}
            <div className="space-y-2">
              <Label>{t('Category')}</Label>
              <Select value={form.categoryId} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v, specs: v === f.categoryId ? f.specs : {} }))} disabled={!editable}>
                <SelectTrigger className="w-full" aria-invalid={!!errors.categoryId}><SelectValue placeholder={t('Choose…')} /></SelectTrigger>
                <SelectContent>
                  {categoryTree(categories.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.label}{c.active === false && ` ${t('(hidden)')}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.categoryId && <p className="text-sm text-destructive">{t(errors.categoryId)}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">{t('Price (ETB)')}</Label>
              <Input id="price" type="number" min="0.01" step="0.01" inputMode="decimal" value={form.price} onChange={(e) => set('price', e.target.value)} aria-invalid={!!errors.price} />
              {errors.price && <p className="text-sm text-destructive">{t(errors.price)}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="threshold">{t('Low-stock alert at')}</Label>
              <Input id="threshold" type="number" min="0" value={form.lowStockThreshold} onChange={(e) => set('lowStockThreshold', e.target.value)} />
              <p className="text-xs text-muted-foreground">{t('Store shows “only N left” at or below this.')}</p>
            </div>
            {isNew && (
              <div className="space-y-2">
                <Label htmlFor="stock">{t('Starting stock')}</Label>
                <Input id="stock" type="number" min="0" value={form.stock} onChange={(e) => set('stock', e.target.value)} />
              </div>
            )}
            <div className="rounded-lg border bg-muted/30 p-3 sm:col-span-2 empty:hidden">
              <SpecFields categoryId={form.categoryId ? Number(form.categoryId) : null} value={form.specs}
                onChange={(specs) => set('specs', specs)} errors={errors} disabled={!editable} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <span className="text-sm font-medium">{t('Condition')}</span>
              <div className="flex flex-wrap gap-2" role="group" aria-label={t('Condition')}>
                {([['', seller ? 'Not set' : 'New (shop stock)'], ['NEW', 'New'], ['LIKE_NEW', 'Like new'], ['USED', 'Used']] as const).map(([v, label]) => (
                  <button
                    key={v || 'none'}
                    type="button"
                    aria-pressed={form.condition === v}
                    disabled={!editable}
                    onClick={() => set('condition', v)}
                    className={cn('h-10 flex-1 rounded-lg border px-3 text-sm font-semibold', form.condition === v ? 'border-2 border-primary bg-primary/5 text-primary' : 'bg-card')}
                  >
                    {t(label)}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="area">{t('Where is it?')}</Label>
              <Input id="area" list="area-list" maxLength={120} value={form.area} onChange={(e) => set('area', e.target.value)} placeholder={t("Leave empty for the shop's area")} />
              <datalist id="area-list">{areas.data?.map((a) => <option key={a} value={a} />)}</datalist>
            </div>
            <label className="flex items-center justify-between gap-3 rounded-lg border p-3 sm:self-end">
              <span>
                <span className="block text-sm font-medium">{t('Price negotiable')}</span>
                <span className="block text-xs text-muted-foreground">{t('Buyers may offer less')}</span>
              </span>
              <Switch checked={form.negotiable} onCheckedChange={(v) => set('negotiable', v)} disabled={!editable} />
            </label>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="description">{t('Description')}</Label>
              <Textarea id="description" rows={5} maxLength={5000} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder={t('What it is, size, materials, care…')} />
            </div>
            <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <span>
                <span className="block text-sm font-medium">{t('Show in store')}</span>
                <span className="block text-xs text-muted-foreground">{t('Off = hidden, but kept for order history')}</span>
              </span>
              <Switch checked={form.active} onCheckedChange={(v) => set('active', v)} disabled={!editable} />
            </label>
            {!seller && <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <span>
                <span className="block text-sm font-medium">{t('Featured')}</span>
                <span className="block text-xs text-muted-foreground">{t('Shown on the home page')}</span>
              </span>
              <Switch checked={form.featured} onCheckedChange={(v) => set('featured', v)} disabled={!editable} />
            </label>}
          </fieldset>
          {editable && (
            <div className="sm:col-span-2">
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} {isNew ? t('Create product') : t('Save changes')}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  )
}

function Photos({ detail, onChange }: { detail: ProductDetail; onChange: (d: ProductDetail) => void }) {
  const t = useT()
  const { editable, client } = useEditor()
  const id = detail.product.id
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [dragId, setDragId] = useState<number | null>(null)
  const room = detail.maxImages - detail.images.length

  const upload = async (files: File[]) => {
    const list = files.slice(0, room)
    if (files.length > room) toast.warning(t(room === 1 ? 'Only {n} more photo allowed (max {max}).' : 'Only {n} more photos allowed (max {max}).', { n: room, max: detail.maxImages }))
    for (const [i, f] of list.entries()) {
      if (!TYPES.includes(f.type)) { toast.error(t('{name}: use JPG, PNG or WebP.', { name: f.name })); continue }
      if (f.size > MAX_BYTES) { toast.error(t('{name} is larger than 5 MB.', { name: f.name })); continue }
      setUploading(t('Uploading {i} of {n}: {name}', { i: i + 1, n: list.length, name: f.name }))
      try {
        onChange(await client.uploadImage(id, f))
      } catch (e) {
        toast.error(`${f.name}: ${(e as Error).message}`)
      }
    }
    setUploading(null)
  }

  const run = useMutation({
    mutationFn: (fn: () => Promise<ProductDetail>) => fn(),
    onSuccess: onChange,
    onError: (e) => toast.error(e.message),
  })
  const order = detail.images.map((i) => i.id)
  const move = (from: number, to: number) => {
    const next = [...order]
    const [x] = next.splice(from, 1)
    next.splice(to, 0, x)
    run.mutate(() => client.reorderImages(id, next))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          {t('Photos')} <span className="text-xs font-normal text-muted-foreground">{detail.images.length} / {detail.maxImages}</span>
        </CardTitle>
        <CardDescription>{t('The first photo is the main one. Drag to reorder. JPG, PNG or WebP, up to 5 MB, at least 300×300.')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {detail.images.length === 0 && detail.product.imageUrl && (
          <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            {t('Currently using a built-in photo. Upload one to replace it.')}
          </p>
        )}
        <div className="grid grid-cols-3 gap-3">
          {detail.images.map((img, i) => (
            <div
              key={img.id}
              draggable={editable}
              onDragStart={() => setDragId(img.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                if (dragId !== null && dragId !== img.id) move(order.indexOf(dragId), i)
                setDragId(null)
              }}
              className={cn('group relative overflow-hidden rounded-xl border bg-muted', dragId === img.id && 'opacity-50')}
            >
              <img src={img.thumbUrl} alt={t('Photo {n}', { n: i + 1 })} className="aspect-square w-full object-cover" />
              {i === 0 && <Badge className="absolute left-1.5 top-1.5 gap-1 text-[10px]"><Star className="size-3" /> {t('Main')}</Badge>}
              {editable && (
                <>
                  <GripVertical className="absolute right-1.5 top-1.5 size-4 text-white drop-shadow" />
                  <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                    <span className="flex gap-1">
                      <Button size="icon-xs" variant="secondary" aria-label={t('Move left')} disabled={i === 0} onClick={() => move(i, i - 1)}><ArrowLeft /></Button>
                      <Button size="icon-xs" variant="secondary" aria-label={t('Move right')} disabled={i === detail.images.length - 1} onClick={() => move(i, i + 1)}><ArrowRight /></Button>
                    </span>
                    {i !== 0 && (
                      <Button size="icon-xs" variant="secondary" aria-label={t('Make main photo')} onClick={() => move(i, 0)}><Star /></Button>
                    )}
                    <Button
                      size="icon-xs"
                      variant="destructive"
                      aria-label={t('Remove photo')}
                      onClick={() => confirm(t('Remove this photo?')) && run.mutate(() => client.removeImage(id, img.id))}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
          {editable && room > 0 && (
            <button
              type="button"
              onClick={() => input.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                if (dragId === null) void upload(Array.from(e.dataTransfer.files))
              }}
              disabled={!!uploading}
              className={cn(
                'flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-xs text-muted-foreground transition hover:border-brand hover:text-brand',
                dragOver && 'border-brand bg-brand/5 text-brand',
              )}
            >
              {uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
              {uploading ? t('Uploading…') : t('Add photos')}
            </button>
          )}
        </div>
        {uploading && <p className="text-xs text-muted-foreground">{uploading}</p>}
        <input
          ref={input}
          type="file"
          accept={TYPES.join(',')}
          multiple
          hidden
          onChange={(e) => {
            void upload(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />
      </CardContent>
    </Card>
  )
}

function Stock({ detail, onChange }: { detail: ProductDetail; onChange: (d: ProductDetail) => void }) {
  const t = useT()
  const { editable, client } = useEditor()
  const p = detail.product
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('Restock')
  const adjust = useMutation({
    mutationFn: (delta: number) => client.adjustStock(p.id, delta, reason),
    onSuccess: (d) => {
      onChange(d)
      setAmount('')
      toast.success(t('Stock is now {n}', { n: d.product.stock }))
    },
    onError: (e) => toast.error(e.message),
  })
  const n = Math.abs(Math.trunc(Number(amount) || 0))
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('Stock')}</CardTitle>
        <CardDescription>{t("Units held by unpaid orders can't be removed.")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[['In stock', p.stock], ['Held', p.reserved], ['Available', p.available]].map(([label, v]) => (
            <div key={label} className="rounded-lg bg-muted/60 p-2">
              <p className="text-lg font-semibold tabular-nums">{v}</p>
              <p className="text-[11px] text-muted-foreground">{t(String(label))}</p>
            </div>
          ))}
        </div>
        {editable && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input type="number" min="1" placeholder={t('Quantity')} value={amount} onChange={(e) => setAmount(e.target.value)} className="w-28" />
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['Restock', 'Stock count correction', 'Damaged or lost', 'Returned by customer', 'Other'].map((r) => (
                    <SelectItem key={r} value={r}>{t(r)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" disabled={!n || adjust.isPending} onClick={() => adjust.mutate(-n)}>
                <Minus /> {t('Remove {n}', { n: n || '' })}
              </Button>
              <Button className="flex-1" disabled={!n || adjust.isPending} onClick={() => adjust.mutate(n)}>
                <Plus /> {t('Add {n}', { n: n || '' })}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function History({ id }: { id: number }) {
  const t = useT()
  const { client, keyPrefix } = useEditor()
  const { data } = useQuery({ queryKey: [`${keyPrefix}-product-changes`, id], queryFn: () => client.changes(id) })
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('History')}</CardTitle>
      </CardHeader>
      <CardContent>
        {data?.content.length === 0 && <p className="text-sm text-muted-foreground">{t('No changes yet.')}</p>}
        <ol className="space-y-3">
          {data?.content.map((c) => (
            <li key={c.id} className="text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[11px]">{ACTION_LABEL[c.action] ? t(ACTION_LABEL[c.action]) : c.action}</Badge>
                <span className="text-xs text-muted-foreground">{formatDate(c.createdAt)} · {c.userEmail ?? t('system')}</span>
              </div>
              {c.detail && <p className="mt-0.5 break-words text-xs">{c.detail}</p>}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

export function AdminProductEditPage() {
  return <ProductEditor client={catalogApi} editable={isAdmin()} basePath="/admin/products" keyPrefix="admin" />
}

/** The product page, for staff (any product) or a seller (their own, through sellerCatalog). */
export function ProductEditor(config: EditorConfig) {
  return (
    <EditorContext.Provider value={config}>
      <EditorPage />
    </EditorContext.Provider>
  )
}

function EditorPage() {
  const t = useT()
  const { client, keyPrefix, basePath, editable, seller } = useEditor()
  const { productId = 'new' } = useParams()
  const isNew = productId === 'new'
  const id = Number(productId)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: [`${keyPrefix}-product`, id], queryFn: () => client.product(id), enabled: !isNew })

  const refresh = (d: ProductDetail) => {
    qc.setQueryData([`${keyPrefix}-product`, d.product.id], d)
    qc.invalidateQueries({ queryKey: [`${keyPrefix}-products`] })
    qc.invalidateQueries({ queryKey: [`${keyPrefix}-product-changes`, d.product.id] })
  }
  const toggle = useMutation({
    mutationFn: () => client.setVisible(id, !data!.product.active),
    onSuccess: (d) => { refresh(d); toast.success(d.product.active ? t('Shown in the store') : t('Hidden from the store')) },
    onError: (e) => toast.error(e.message),
  })
  const duplicate = useMutation({
    mutationFn: () => client.duplicate(id),
    onSuccess: (d) => { refresh(d); toast.success(t('Copy created (hidden, no stock)')); navigate(`${basePath}/${d.product.id}`) },
    onError: (e) => toast.error(e.message),
  })

  if (!isNew && (isLoading || !data)) return <Skeleton className="h-96 rounded-xl" />
  const p = data?.product

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link to={basePath}><ChevronLeft /> {t('Products')}</Link>
      </Button>
      <PageHeader
        title={isNew ? t('New product') : p!.name}
        description={isNew ? t('Save the details first, then add photos.') : `${p!.categoryName} · ${formatETB(p!.price)}`}
        actions={
          !isNew && (
            <div className="flex flex-wrap items-center gap-2">
              <StockBadge p={p!} />
              {p!.inStore && (
                <Button asChild variant="outline" size="sm">
                  <a href={`/product/${p!.slug}`} target="_blank" rel="noreferrer"><ExternalLink /> {t('View in store')}</a>
                </Button>
              )}
              {editable && (
                <>
                  <Button variant="outline" size="sm" onClick={() => duplicate.mutate()} disabled={duplicate.isPending}><Copy /> {t('Duplicate')}</Button>
                  <Button variant="outline" size="sm" onClick={() => toggle.mutate()} disabled={toggle.isPending}>
                    {p!.active ? <><EyeOff /> {t('Hide')}</> : <><Eye /> {t('Show')}</>}
                  </Button>
                </>
              )}
            </div>
          )
        }
      />
      {p?.blockedReason && <BlockedNote id={p.id} reason={p.blockedReason} seller={!!seller} />}
      {seller && p && p.active && !p.inStore && !p.blockedReason && (
        <p className="rounded-lg bg-amber-soft p-3 text-sm text-amber-ink">
          {t("Shoppers can't see this yet: it shows in the store once Sodo Gebeya approves your shop.")}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <DetailsForm
            key={p ? `${p.id}-${p.updatedAt}` : 'new'}
            detail={data}
            onSaved={(d) => {
              refresh(d)
              toast.success(isNew ? t('Product created. Now add photos.') : t('Saved'))
              if (isNew) navigate(`${basePath}/${d.product.id}`, { replace: true })
            }}
          />
          {data && <Photos detail={data} onChange={refresh} />}
        </div>
        {data && (
          <div className="space-y-6">
            <Stock detail={data} onChange={refresh} />
            <History id={data.product.id} />
          </div>
        )}
      </div>
    </>
  )
}

const HOLD_PREFIX = 'Held for a check: '

/** Why a listing is out of the store: held automatically (fraud rules) or taken down by staff after reports. */
function BlockedNote({ id, reason, seller }: { id: number; reason: string; seller: boolean }) {
  const t = useT()
  const qc = useQueryClient()
  const held = reason.startsWith(HOLD_PREFIX)
  const putBack = useMutation({
    mutationFn: () => trustAdminApi.unblockListing(id),
    onSuccess: () => {
      qc.invalidateQueries()
      toast.success(t('Put back in the store'))
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <div className={cn('flex flex-wrap items-center gap-3 rounded-lg p-3 text-sm', held ? 'bg-amber-soft text-amber-ink' : 'bg-destructive/10 text-destructive')}>
      <p className="min-w-0 flex-1">
        <span className="font-semibold">{held ? t('Held for a quick check:') : t('Taken down by Sodo Gebeya after reports:')}</span>{' '}
        {held ? reason.slice(HOLD_PREFIX.length) : `${reason}.`}{' '}
        {seller ? (held ? t('We usually check within a day; you can edit it meanwhile.') : t('Fix it, then call us to put it back.')) : ''}
      </p>
      {!seller && isAdmin() && (
        <Button size="sm" variant="outline" disabled={putBack.isPending} onClick={() => putBack.mutate()}>{t('Put back in the store')}</Button>
      )}
    </div>
  )
}
