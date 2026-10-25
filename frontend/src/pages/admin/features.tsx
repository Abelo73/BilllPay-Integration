import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { featureAdminApi, isAdmin, type FeatureSetting } from '@/lib/admin-api'
import { cn } from '@/lib/utils'
import { PageHeader } from './shared'

function ValueEditor({ s, onSave, saving }: { s: FeatureSetting; onSave: (v: string) => void; saving: boolean }) {
  const [draft, setDraft] = useState(s.value)
  const admin = isAdmin()
  if (s.type === 'SWITCH') {
    return <Switch checked={s.value === 'true'} disabled={!admin || saving} onCheckedChange={(v) => onSave(String(v))} aria-label={s.label} />
  }
  const changed = draft !== s.value
  return (
    <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); onSave(draft) }}>
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={!admin}
        inputMode={s.type === 'NUMBER' ? 'decimal' : undefined}
        className={cn('h-8', s.type === 'NUMBER' ? 'w-24 text-right tabular-nums' : 'w-48')}
        aria-label={s.label}
      />
      {admin && changed && (
        <Button type="submit" size="icon-sm" disabled={saving} aria-label="Save">{saving ? <Loader2 className="animate-spin" /> : <Check />}</Button>
      )}
    </form>
  )
}

/** Admin → Features: ON/OFF switches and prices, no restart needed. */
export function AdminFeaturesPage() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['admin-features'], queryFn: featureAdminApi.list })
  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => featureAdminApi.set(key, value),
    onSuccess: (list, v) => {
      qc.setQueryData(['admin-features'], list)
      qc.invalidateQueries({ queryKey: ['features'] })
      const s = list.find((x) => x.key === v.key)
      toast.success(s?.type === 'SWITCH' ? `${s.label}: ${s.value === 'true' ? 'on' : 'off'}` : `${s?.label} saved`)
    },
    onError: (e) => toast.error(e.message),
  })
  const groups = [...new Set(data?.map((s) => s.group) ?? [])]

  return (
    <>
      <PageHeader title="Features" description="Turn parts of Sodo Gebeya on or off and set prices. Changes apply at once for everyone." />
      {!data && <Skeleton className="h-96 rounded-xl" />}
      {groups.map((g) => (
        <Card key={g}>
          <CardHeader><CardTitle className="text-base">{g}</CardTitle></CardHeader>
          <CardContent className="divide-y p-0">
            {data!.filter((s) => s.group === g).map((s) => (
              <div key={s.key} className="flex flex-wrap items-center gap-3 px-6 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{s.label}</p>
                  {s.help && <p className="text-xs text-muted-foreground">{s.help}</p>}
                </div>
                {isAdmin() && s.value !== s.defaultValue && (
                  <Button size="icon-sm" variant="ghost" title={`Back to the default (${s.defaultValue || 'empty'})`} aria-label="Back to default"
                    onClick={() => save.mutate({ key: s.key, value: s.defaultValue })}>
                    <RotateCcw />
                  </Button>
                )}
                <ValueEditor key={`${s.key}-${s.value}`} s={s} saving={save.isPending && save.variables?.key === s.key} onSave={(value) => save.mutate({ key: s.key, value })} />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </>
  )
}
