import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Wallet } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate, formatETB } from '@/lib/format'
import { moneyApi, PAYOUT_METHOD_LABEL, type PayoutMethod, type SellerMoney } from '@/lib/seller-api'
import { cn } from '@/lib/utils'
import { Pager } from '../admin/shared'

const PAYOUT_STATUS: Record<string, { label: string; cls: string }> = {
  REQUESTED: { label: 'On its way', cls: 'text-amber-ink' },
  PAID: { label: 'Sent', cls: 'text-success' },
  REJECTED: { label: 'Not sent', cls: 'text-destructive' },
}

const EARNING: Record<string, { label: string; cls: string }> = {
  HELD: { label: 'Held', cls: 'text-amber-ink' },
  RELEASED: { label: 'Available', cls: 'text-success' },
  CANCELLED: { label: 'Cancelled', cls: 'text-muted-foreground line-through' },
}

function AccountForm({ money, onSaved }: { money: SellerMoney; onSaved: () => void }) {
  const a = money.account
  const [method, setMethod] = useState<PayoutMethod>(a?.method ?? 'TELEBIRR')
  const [provider, setProvider] = useState(a?.provider ?? '')
  const [accountName, setAccountName] = useState(a?.accountName ?? '')
  const [account, setAccount] = useState(a?.account ?? '')
  const save = useMutation({
    mutationFn: () => moneyApi.saveAccount({ method, provider: provider || undefined, accountName, account }),
    onSuccess: () => { toast.success('Payout account saved'); onSaved() },
    onError: (e) => toast.error(e.message),
  })
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Payout method">
        {(Object.keys(PAYOUT_METHOD_LABEL) as PayoutMethod[]).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(m)}
            className={cn('h-9 rounded-full border px-3 text-sm font-semibold', method === m ? 'border-primary bg-primary/10 text-primary' : 'bg-card text-muted-foreground')}>
            {PAYOUT_METHOD_LABEL[m]}
          </button>
        ))}
      </div>
      {method === 'BANK' && (
        <div className="space-y-1.5">
          <Label htmlFor="pay-bank">Bank</Label>
          <Input id="pay-bank" value={provider} maxLength={80} onChange={(e) => setProvider(e.target.value)} placeholder="e.g. Commercial Bank of Ethiopia" />
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pay-name">Account holder</Label>
          <Input id="pay-name" value={accountName} maxLength={120} onChange={(e) => setAccountName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pay-account">{method === 'BANK' ? 'Account number' : 'Phone number'}</Label>
          <Input id="pay-account" value={account} maxLength={40} inputMode="numeric" onChange={(e) => setAccount(e.target.value)} />
        </div>
      </div>
      <Button type="submit" variant="outline" disabled={save.isPending || !accountName.trim() || !account.trim()}>
        {save.isPending && <Loader2 className="animate-spin" />} Save payout account
      </Button>
    </form>
  )
}

/** /seller/money: held and available money, payout account and requests, and a statement per parcel. */
export function SellerMoneyPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(0)
  const [amount, setAmount] = useState('')
  const [editAccount, setEditAccount] = useState(false)
  const { data, isLoading } = useQuery({ queryKey: ['seller-money'], queryFn: moneyApi.get })
  const statement = useQuery({ queryKey: ['seller-statement', page], queryFn: () => moneyApi.statement(page), placeholderData: keepPreviousData })
  const refresh = () => { qc.invalidateQueries({ queryKey: ['seller-money'] }); qc.invalidateQueries({ queryKey: ['seller-summary'] }) }
  const ask = useMutation({
    mutationFn: () => moneyApi.requestPayout(Number(amount)),
    onSuccess: (p) => { toast.success(`Asked for ${formatETB(p.amount)}. We'll text you when it's sent.`); setAmount(''); refresh() },
    onError: (e) => toast.error(e.message),
  })

  if (isLoading || !data) return <Skeleton className="h-96 rounded-2xl" />
  const b = data.balance
  const pending = data.recentPayouts.some((p) => p.status === 'REQUESTED')

  return (
    <div className="space-y-5 pb-6">
      <div className="space-y-3 rounded-2xl bg-[#13201A] p-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-white/70">Ready to withdraw</p>
            <p className="text-3xl font-extrabold tabular-nums">{formatETB(b.available)}</p>
          </div>
          <Wallet className="size-6 text-white/60" />
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-white/70">
          <span>Held until delivery: <strong className="text-white">{formatETB(b.held)}</strong></span>
          {b.requested > 0 && <span>On its way to you: <strong className="text-white">{formatETB(b.requested)}</strong></span>}
          <span>Paid out so far: <strong className="text-white">{formatETB(b.paidOut)}</strong></span>
        </div>
        <p className="text-[11px] text-white/60">
          Buyers' money is held by Sodo Gebeya until they confirm they got their items, or {data.releaseAfterHours} hours after delivery. Then it's yours to withdraw.
        </p>
      </div>

      <section className="space-y-3 rounded-2xl border bg-card p-4">
        <h2 className="text-base font-bold">Withdraw</h2>
        {!data.account || editAccount ? (
          <>
            <p className="text-sm text-muted-foreground">Where should we send your money?</p>
            <AccountForm money={data} onSaved={() => { setEditAccount(false); refresh() }} />
          </>
        ) : (
          <>
            <p className="text-sm">
              To {PAYOUT_METHOD_LABEL[data.account.method]}{data.account.provider && ` (${data.account.provider})`}: <span className="font-semibold">{data.account.accountName}</span>, {data.account.account}{' '}
              <button type="button" className="text-sm font-semibold text-primary hover:underline" onClick={() => setEditAccount(true)}>Change</button>
            </p>
            {pending ? (
              <p className="rounded-lg bg-amber-soft p-3 text-sm text-amber-ink">A payout is on its way. You can ask again once it's sent.</p>
            ) : (
              <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); ask.mutate() }}>
                <Input type="number" min={b.minimum} max={b.available} step="0.01" inputMode="decimal" aria-label="Amount in birr" className="w-40"
                  value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`${b.minimum} or more`} />
                <Button type="button" variant="outline" disabled={b.available < b.minimum} onClick={() => setAmount(String(b.available))}>All</Button>
                <Button type="submit" disabled={ask.isPending || !(Number(amount) >= b.minimum) || Number(amount) > b.available}>
                  {ask.isPending && <Loader2 className="animate-spin" />} Ask for payout
                </Button>
                <p className="w-full text-xs text-muted-foreground">Smallest payout {formatETB(b.minimum)}. Our team sends it and texts you the reference.</p>
              </form>
            )}
          </>
        )}
        {data.recentPayouts.length > 0 && (
          <ul className="divide-y border-t pt-1 text-sm">
            {data.recentPayouts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span>{formatDate(p.requestedAt)} · {PAYOUT_METHOD_LABEL[p.method]} {p.account}</span>
                <span className="flex items-baseline gap-2">
                  <span className={cn('text-xs font-semibold', PAYOUT_STATUS[p.status].cls)}>{PAYOUT_STATUS[p.status].label}{p.reference && ` · ref ${p.reference}`}</span>
                  <strong className="tabular-nums">{formatETB(p.amount)}</strong>
                </span>
                {p.note && <span className="w-full text-xs text-muted-foreground">{p.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold">Statement</h2>
        <p className="text-xs text-muted-foreground">Each sale: what the buyer paid for your parcel, the Sodo Gebeya fee, and what you get.</p>
        {statement.data?.content.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">No sales yet.</p>
        ) : (
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card text-sm">
            {statement.data?.content.map((l) => (
              <li key={l.parcelNumber} className="space-y-0.5 px-4 py-3">
                <div className="flex justify-between gap-2">
                  <span className="font-mono text-xs font-semibold">{l.parcelNumber}</span>
                  <strong className={cn('tabular-nums', l.payoutStatus === 'CANCELLED' && 'text-muted-foreground line-through')}>{formatETB(l.sellerAmount)}</strong>
                </div>
                <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {formatDate(l.paidAt)} · items {formatETB(l.itemsTotal)} + delivery {formatETB(l.deliveryFee)}
                    {l.commission > 0 && ` − fee ${formatETB(l.commission)} (${l.commissionPercent}%)`}
                  </span>
                  <span className={cn('font-semibold', EARNING[l.payoutStatus].cls)}>{EARNING[l.payoutStatus].label}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {statement.data && <Pager page={page} totalPages={statement.data.totalPages} total={statement.data.totalElements} size={statement.data.size} onPage={setPage} />}
      </section>
    </div>
  )
}
