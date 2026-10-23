import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ImageOff, Plus, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { catalogApi, isAdmin, type ProductRow } from '@/lib/admin-api'
import { formatETB } from '@/lib/format'
import { cn } from '@/lib/utils'
import { EmptyRow, PageHeader, Pager } from './shared'

export function StockBadge({ p }: { p: Pick<ProductRow, 'available' | 'lowStock' | 'active'> }) {
  if (!p.active) return <Badge variant="outline" className="bg-muted text-muted-foreground">hidden</Badge>
  if (p.available <= 0) return <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">out of stock</Badge>
  if (p.lowStock) return <Badge variant="outline" className="border-warning/40 bg-warning/15">low stock</Badge>
  return <Badge variant="outline" className="border-success/30 bg-success/15 text-success">in store</Badge>
}

export function Thumb({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  return src ? (
    <img src={src} alt={alt} className={cn('size-11 rounded-lg object-cover ring-1 ring-border', className)} loading="lazy" />
  ) : (
    <span className={cn('grid size-11 place-items-center rounded-lg bg-muted text-muted-foreground', className)}>
      <ImageOff className="size-4" />
    </span>
  )
}

export function AdminProductsPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const status = params.get('status') ?? 'all'
  const categoryId = params.get('category') ? Number(params.get('category')) : undefined
  const q = params.get('q') ?? ''
  const page = Number(params.get('page') ?? 0)
  const [search, setSearch] = useState(q)

  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    if (k !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }
  useEffect(() => {
    const t = setTimeout(() => search !== q && set('q', search || null), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const categories = useQuery({ queryKey: ['admin-categories'], queryFn: catalogApi.categories })
  const { data } = useQuery({
    queryKey: ['admin-products', q, categoryId, status, page],
    queryFn: () => catalogApi.products({ q, categoryId, status, page }),
    placeholderData: keepPreviousData,
  })

  return (
    <>
      <PageHeader
        title="Products"
        description="Everything in the catalog. Hidden products stay here (orders keep their history) and can be shown again."
        actions={isAdmin() && <Button asChild><Link to="/admin/products/new"><Plus /> New product</Link></Button>}
      />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <Tabs value={status} onValueChange={(v) => set('status', v === 'all' ? null : v)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="active">In store</TabsTrigger>
            <TabsTrigger value="low">Low stock</TabsTrigger>
            <TabsTrigger value="out">Out of stock</TabsTrigger>
            <TabsTrigger value="hidden">Hidden</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex gap-2 lg:ml-auto">
          <Select value={categoryId ? String(categoryId) : 'all'} onValueChange={(v) => set('category', v === 'all' ? null : v)}>
            <SelectTrigger className="w-44" aria-label="Category"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.data?.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Name or slug" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.content.length === 0 && <EmptyRow colSpan={5} text="No products match." />}
              {data?.content.map((p) => (
                <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/admin/products/${p.id}`)}>
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-3">
                      <Thumb src={p.imageUrl} alt={p.name} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {p.name} {p.featured && <span className="ml-1 text-xs text-brand">★ featured</span>}
                        </p>
                        <p className="truncate font-mono text-xs text-muted-foreground">{p.slug}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{p.categoryName}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatETB(p.price)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className={cn(p.available <= 0 && 'text-destructive', p.lowStock && 'font-medium')}>{p.available}</span>
                    {p.reserved > 0 && <span className="block text-[11px] text-muted-foreground">{p.reserved} held by unpaid orders</span>}
                  </TableCell>
                  <TableCell><StockBadge p={p} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {data && <Pager page={page} totalPages={data.totalPages} onPage={(p) => set('page', String(p))} />}
    </>
  )
}
