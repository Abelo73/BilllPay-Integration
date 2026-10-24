import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, Tag } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { adminApi, isAdmin, type DiscountInput, type DiscountRow } from '@/lib/admin-api'
import { formatDate, formatETB } from '@/lib/format'
import { EmptyRow, PageHeader, StatusBadge } from './shared'

type Form = {
  code: string
  description: string
  kind: 'PERCENT' | 'FIXED'
  value: string
  maxDiscount: string
  minSubtotal: string
  startsAt: string
  expiresAt: string
  usageLimit: string
}

const EMPTY: Form = { code: '', description: '', kind: 'PERCENT', value: '', maxDiscount: '', minSubtotal: '', startsAt: '', expiresAt: '', usageLimit: '' }

/** datetime-local value (local time) → ISO instant, or undefined when empty */
const toInstant = (v: string) => (v ? new Date(v).toISOString() : undefined)
const num = (v: string) => (v.trim() === '' ? undefined : Number(v))

function describe(d: DiscountRow) {
  const off = d.kind === 'PERCENT' ? `${d.value}% off${d.maxDiscount ? ` (max ${formatETB(d.maxDiscount)})` : ''}` : `${formatETB(d.value)} off`
  return d.minSubtotal > 0 ? `${off} · min ${formatETB(d.minSubtotal)}` : off
}

function NewCode({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient()
  const [f, setF] = useState<Form>(EMPTY)
  const set = (k: keyof Form, v: string) => setF({ ...f, [k]: v })
  const create = useMutation({
    mutationFn: (form: Form) => {
      const body: DiscountInput = {
        code: form.code.trim(),
        description: form.description.trim() || undefined,
        kind: form.kind,
        value: Number(form.value),
        maxDiscount: form.kind === 'PERCENT' ? num(form.maxDiscount) : undefined,
        minSubtotal: num(form.minSubtotal),
        startsAt: toInstant(form.startsAt),
        expiresAt: toInstant(form.expiresAt),
        usageLimit: num(form.usageLimit),
      }
      return adminApi.createDiscount(body)
    },
    onSuccess: (list) => {
      qc.setQueryData(['admin-discounts'], list)
      toast.success('Discount code created')
      setF(EMPTY)
      onDone()
    },
    onError: (e) => toast.error(e.message),
  })

  const field = (k: keyof Form, label: string, props: React.ComponentProps<'input'> = {}) => (
    <div className="space-y-2">
      <Label htmlFor={`d-${k}`}>{label}</Label>
      <Input id={`d-${k}`} className="h-10" value={f[k]} onChange={(e) => set(k, e.target.value)} {...props} />
    </div>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New discount code</CardTitle>
        <CardDescription>The discount comes off the items; delivery is worked out on what's left. Codes can't be deleted, only switched off.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => { e.preventDefault(); create.mutate(f) }}>
          {field('code', 'Code', { required: true, placeholder: 'MESKEL10', className: 'h-10 uppercase', pattern: '[A-Za-z0-9_-]{3,40}' })}
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={f.kind} onValueChange={(v) => set('kind', v)}>
              <SelectTrigger className="h-10 w-full" aria-label="Type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PERCENT">Percentage</SelectItem>
                <SelectItem value="FIXED">Fixed amount (ETB)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {field('value', f.kind === 'PERCENT' ? 'Percent off' : 'ETB off', { required: true, type: 'number', min: '0.01', step: '0.01', max: f.kind === 'PERCENT' ? '100' : undefined })}
          {f.kind === 'PERCENT'
            ? field('maxDiscount', 'Max discount (ETB, optional)', { type: 'number', min: '0.01', step: '0.01' })
            : <div className="hidden lg:block" />}
          {field('minSubtotal', 'Minimum cart (ETB, optional)', { type: 'number', min: '0', step: '0.01' })}
          {field('usageLimit', 'Total uses (optional)', { type: 'number', min: '1', step: '1' })}
          {field('startsAt', 'Starts (optional)', { type: 'datetime-local' })}
          {field('expiresAt', 'Ends (optional)', { type: 'datetime-local' })}
          <div className="sm:col-span-2 lg:col-span-4">{field('description', 'Shown to the shopper (optional)', { placeholder: '10% off for Meskel', maxLength: 200 })}</div>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
            <Button type="submit" disabled={create.isPending}>{create.isPending && <Loader2 className="animate-spin" />} Create code</Button>
            <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function AdminDiscountsPage() {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const { data } = useQuery({ queryKey: ['admin-discounts'], queryFn: adminApi.discounts })
  const toggle = useMutation({
    mutationFn: (d: DiscountRow) => adminApi.updateDiscount(d.id, { active: !d.active }),
    onSuccess: (list, d) => {
      qc.setQueryData(['admin-discounts'], list)
      toast.success(`${d.code} ${d.active ? 'switched off' : 'switched on'}`)
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <>
      <PageHeader
        title="Discount codes"
        description="Codes shoppers enter at checkout. A use is held while an order is unpaid and given back if it's cancelled or expires."
        actions={isAdmin() && !adding && <Button onClick={() => setAdding(true)}><Plus /> New code</Button>}
      />
      {adding && <NewCode onDone={() => setAdding(false)} />}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Code</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Uses</TableHead>
                <TableHead>Valid</TableHead>
                <TableHead className="text-right">Paid orders</TableHead>
                <TableHead className="text-right">Given</TableHead>
                <TableHead className="pr-4 text-right">On</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.length === 0 && <EmptyRow colSpan={7} text="No discount codes yet." />}
              {data?.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-2 font-mono text-sm font-medium"><Tag className="size-3.5 text-muted-foreground" />{d.code}</div>
                    {d.description && <div className="max-w-56 truncate text-xs text-muted-foreground">{d.description}</div>}
                  </TableCell>
                  <TableCell className="text-sm">{describe(d)}</TableCell>
                  <TableCell className="text-sm tabular-nums">{d.timesUsed}{d.usageLimit ? ` / ${d.usageLimit}` : ''}</TableCell>
                  <TableCell>
                    <StatusBadge status={d.state} />
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {d.startsAt && <>from {formatDate(d.startsAt)} </>}
                      {d.expiresAt ? <>until {formatDate(d.expiresAt)}</> : !d.startsAt && 'no end date'}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{d.paidOrders}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatETB(d.discountGiven)}</TableCell>
                  <TableCell className="pr-4 text-right">
                    <Switch checked={d.active} disabled={!isAdmin() || toggle.isPending} onCheckedChange={() => toggle.mutate(d)} aria-label={`${d.code} active`} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  )
}
