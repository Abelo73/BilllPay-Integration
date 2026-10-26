import { useMutation } from '@tanstack/react-query'
import { Bookmark, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useT } from '@/lib/i18n'
import { searchApi, type SavedSearchInput } from '@/lib/search-api'
import { cn } from '@/lib/utils'
import { useSession } from '@/store/session'

/** Price from / to (birr); applied when the person leaves the box or presses Enter. */
export function PriceRange({ min, max, onChange }: { min: string; max: string; onChange: (min: string, max: string) => void }) {
  const t = useT()
  const [a, setA] = useState(min)
  const [b, setB] = useState(max)
  const apply = () => {
    if (a !== min || b !== max) onChange(a, b)
  }
  const box = 'h-9 w-28 bg-card'
  return (
    <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); apply() }}>
      <label className="space-y-1 text-xs font-medium text-muted-foreground">
        {t('Price from')}
        <Input type="number" min={0} inputMode="numeric" value={a} onChange={(e) => setA(e.target.value)} onBlur={apply} placeholder="0" className={box} />
      </label>
      <label className="space-y-1 text-xs font-medium text-muted-foreground">
        {t('to (birr)')}
        <Input type="number" min={0} inputMode="numeric" value={b} onChange={(e) => setB(e.target.value)} onBlur={apply} placeholder={t('Any')} className={box} />
      </label>
      <button type="submit" className="sr-only">{t('Apply')}</button>
    </form>
  )
}

/** "Save this search": new listings that match arrive in the inbox (and by SMS once a day if chosen). */
export function SaveSearchButton({ input, disabled, className }: { input: SavedSearchInput; disabled?: boolean; className?: string }) {
  const t = useT()
  const session = useSession((s) => s.session)
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [sms, setSms] = useState(false)
  const save = useMutation({
    mutationFn: () => searchApi.create({ ...input, name: name.trim() || undefined, alertInbox: true, alertSms: sms }),
    onSuccess: () => {
      setOpen(false)
      toast.success(t('Saved. We tell you when new listings match.'), { action: { label: t('See all'), onClick: () => navigate('/searches') } })
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={cn('h-9 rounded-full', className)}
        disabled={disabled}
        title={disabled ? t('Search for something or pick a category first') : undefined}
        onClick={() => (session ? setOpen(true) : navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`))}
      >
        <Bookmark /> {t('Save this search')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Save this search')}</DialogTitle>
            <DialogDescription>{t('When someone lists something that matches, we tell you in your notifications.')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="search-name">{t('Name (optional)')}</Label>
              <Input id="search-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('e.g. Samsung under 20,000')} />
            </div>
            <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <span>
                <span className="block text-sm font-medium">{t('Also by SMS')}</span>
                <span className="block text-xs text-muted-foreground">{t('At most one SMS a day for this search.')}</span>
              </span>
              <Switch checked={sms} onCheckedChange={setSms} />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t('Cancel')}</Button>
            <Button disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending && <Loader2 className="animate-spin" />} {t('Save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

