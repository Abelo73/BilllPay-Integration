import { Loader2, Store, UserRound } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ShopKind } from '@/lib/api'
import type { MyShop, ShopInput } from '@/lib/seller-api'
import { cn } from '@/lib/utils'

/** Suggestions for the area field (typing any other works). The full neighbourhood list for Sodo comes with M4. */
export const SODO_AREAS = ['Arada', 'Merkato', 'Bus station', 'University area']

const KINDS: { value: ShopKind; title: string; text: string; icon: typeof Store }[] = [
  { value: 'SHOP', title: 'A shop', text: 'You run a business with new goods', icon: Store },
  { value: 'INDIVIDUAL', title: 'Just me', text: 'You sell a few things of your own, new or used', icon: UserRound },
]

export function ShopForm({
  shop,
  defaultPhone,
  submitLabel,
  pending,
  onSubmit,
}: {
  shop?: MyShop
  defaultPhone?: string | null
  submitLabel: string
  pending: boolean
  onSubmit: (input: ShopInput) => void
}) {
  const [form, setForm] = useState<ShopInput>({
    kind: shop?.kind ?? 'SHOP',
    name: shop?.name ?? '',
    description: shop?.description ?? '',
    phone: shop?.phone ?? defaultPhone ?? '',
    area: shop?.area ?? '',
    addressLine: shop?.addressLine ?? '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = <K extends keyof ShopInput>(k: K, v: ShopInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (form.name.trim().length < 2) next.name = form.kind === 'SHOP' ? 'Enter the shop name' : 'Enter the name buyers will see'
    if (form.phone.replace(/\D/g, '').length < 9) next.phone = 'Enter a phone number buyers and we can call'
    setErrors(next)
    if (Object.keys(next).length === 0) onSubmit(form)
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Who is selling?</legend>
        <div className="grid grid-cols-2 gap-3">
          {KINDS.map((k) => (
            <label
              key={k.value}
              className={cn(
                'flex cursor-pointer flex-col gap-1 rounded-2xl border-2 bg-card p-4 transition',
                form.kind === k.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
              )}
            >
              <input
                type="radio"
                name="kind"
                value={k.value}
                checked={form.kind === k.value}
                onChange={() => set('kind', k.value)}
                className="sr-only"
              />
              <k.icon className={cn('size-5', form.kind === k.value ? 'text-primary' : 'text-muted-foreground')} />
              <span className="text-sm font-bold">{k.title}</span>
              <span className="text-xs text-muted-foreground">{k.text}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="shop-name">{form.kind === 'SHOP' ? 'Shop name' : 'Seller name'}</Label>
        <Input
          id="shop-name"
          value={form.name}
          maxLength={120}
          onChange={(e) => set('name', e.target.value)}
          placeholder={form.kind === 'SHOP' ? 'e.g. Marta Boutique' : 'e.g. Dawit K.'}
          aria-invalid={!!errors.name}
        />
        {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
        {shop && <p className="text-xs text-muted-foreground">Your shop's address stays /shops/{shop.slug}, so shared links keep working.</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="shop-phone">Phone</Label>
          <Input
            id="shop-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            placeholder="0911 234 567"
            aria-invalid={!!errors.phone}
          />
          {errors.phone ? (
            <p className="text-sm text-destructive">{errors.phone}</p>
          ) : (
            <p className="text-xs text-muted-foreground">We text you here about approval and orders. Not shown to buyers.</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="shop-area">Area in Sodo</Label>
          <Input id="shop-area" list="sodo-areas" value={form.area} maxLength={120} onChange={(e) => set('area', e.target.value)} placeholder="e.g. Arada" />
          <datalist id="sodo-areas">
            {SODO_AREAS.map((a) => <option key={a} value={a} />)}
          </datalist>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="shop-address">Where buyers or riders can find you <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Input id="shop-address" value={form.addressLine} maxLength={200} onChange={(e) => set('addressLine', e.target.value)} placeholder="e.g. Near Arada church, shop no. 12" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="shop-about">About {form.kind === 'SHOP' ? 'the shop' : 'you'} <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Textarea id="shop-about" rows={3} maxLength={2000} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="What you sell, opening hours, delivery…" />
      </div>

      <Button type="submit" size="lg" className="h-12 w-full text-base sm:w-auto" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />} {submitLabel}
      </Button>
    </form>
  )
}
