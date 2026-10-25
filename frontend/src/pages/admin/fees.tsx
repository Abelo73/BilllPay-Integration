import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Save, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { catalogApi, isAdmin, payoutAdminApi, shopAdminApi, type CommissionRuleRow } from '@/lib/admin-api'
import { formatDate } from '@/lib/format'
import { PageHeader } from './shared'

function scope(r: CommissionRuleRow) {
  if (!r.shopId && !r.categoryId) return 'Everyone (default)'
  return [r.shopName ? `Seller: ${r.shopName}` : null, r.categoryName ? `Category: ${r.categoryName}` : null].filter(Boolean).join(' · ')
}

/** Admin → Fees: the commission Sodo Gebeya takes from each sale (the most specific rule wins). */
export function AdminFeesPage() {
  const qc = useQueryClient()
  const admin = isAdmin()
  const rules = useQuery({ queryKey: ['admin-commission-rules'], queryFn: payoutAdminApi.rules })
  const categories = useQuery({ queryKey: ['admin-categories'], queryFn: catalogApi.categories })
  const shops = useQuery({ queryKey: ['admin-shops', 'APPROVED', '', 0], queryFn: () => shopAdminApi.list({ status: 'APPROVED' }) })
  const [shopId, setShopId] = useState('any')
  const [categoryId, setCategoryId] = useState('any')
  const [percent, setPercent] = useState('')
  const [note, setNote] = useState('')
  const done = (list: CommissionRuleRow[]) => qc.setQueryData(['admin-commission-rules'], list)
  const save = useMutation({
    mutationFn: () => payoutAdminApi.saveRule({
      shopId: shopId === 'any' ? null : Number(shopId),
      categoryId: categoryId === 'any' ? null : Number(categoryId),
      percent: Number(percent),
      note: note || undefined,
    }),
    onSuccess: (list) => { done(list); setPercent(''); setNote(''); toast.success('Saved. New sales use it from now on.') },
    onError: (e) => toast.error(e.message),
  })
  const remove = useMutation({ mutationFn: payoutAdminApi.deleteRule, onSuccess: done, onError: (e) => toast.error(e.message) })
  const def = rules.data?.find((r) => !r.shopId && !r.categoryId)

  return (
    <>
      <PageHeader
        title="Fees"
        description="Commission on each sale, taken from the seller's items (not from delivery). Changes apply to orders paid from now on; past sales keep the rate they were sold at."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rules</CardTitle>
            <CardDescription>The most specific rule wins: seller + category, then seller, then category, then everyone. Now: {def ? `${def.percent}% for everyone` : 'no default'}.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {rules.data?.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-6 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{scope(r)}</p>
                  <p className="text-xs text-muted-foreground">{r.note ?? ''}{r.note && ' · '}{formatDate(r.updatedAt)} by {r.updatedBy}</p>
                </div>
                <span className="text-lg font-semibold tabular-nums">{r.percent}%</span>
                {admin && (r.shopId || r.categoryId) && (
                  <Button size="icon-sm" variant="ghost" aria-label="Remove rule" onClick={() => confirm(`Remove the rule for ${scope(r)}?`) && remove.mutate(r.id)}>
                    <Trash2 />
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
        {admin && (
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-base">Set a rate</CardTitle>
              <CardDescription>Leave seller and category on "Any" to change the rate for everyone.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
                <div className="space-y-1.5">
                  <Label>Seller</Label>
                  <Select value={shopId} onValueChange={setShopId}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any seller</SelectItem>
                      {shops.data?.page.content.map((s) => <SelectItem key={s.shop.id} value={String(s.shop.id)}>{s.shop.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any category</SelectItem>
                      {categories.data?.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fee-percent">Commission (%)</Label>
                  <Input id="fee-percent" type="number" min="0" max="50" step="0.5" value={percent} onChange={(e) => setPercent(e.target.value)} placeholder="e.g. 3" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fee-note">Note <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Input id="fee-note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Launch offer until January" />
                </div>
                <Button type="submit" disabled={save.isPending || percent === '' || Number(percent) < 0 || Number(percent) > 50}>
                  {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Save rate
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}
