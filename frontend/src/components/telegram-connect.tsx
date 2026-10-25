import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'
import { telegramApi } from '@/lib/telegram-api'

/** "Get alerts in Telegram" card on the Notifications page. */
export function TelegramConnect() {
  const t = useT()
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['telegram-link'], queryFn: telegramApi.status })
  const link = useMutation({
    mutationFn: telegramApi.link,
    onSuccess: (r) => {
      window.open(r.url, '_blank', 'noopener')
      toast.info(t('In Telegram, tap Start. Then come back here.'))
    },
    onError: (e) => toast.error(e.message),
  })
  const unlink = useMutation({
    mutationFn: telegramApi.unlink,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['telegram-link'] }); toast.success(t('Telegram alerts are off')) },
  })
  if (!data || (!data.available && !data.linked)) return null
  return (
    <section aria-labelledby="tg-alerts" className="flex items-start gap-3 rounded-2xl border bg-card p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400">
        <Send className="size-5" />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <h2 id="tg-alerts" className="font-bold">{t('Telegram alerts')}</h2>
        {data.linked ? (
          <>
            <p className="text-sm text-muted-foreground">
              {data.username ? t('Linked to @{username}.', { username: data.username }) : t('Linked.')}{' '}
              {t('Everything on this page also comes to Telegram.')}
            </p>
            <Button variant="outline" size="sm" disabled={unlink.isPending} onClick={() => unlink.mutate()}>{t('Turn off')}</Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{t('Get order, chat and job alerts in Telegram for free.')}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={link.isPending} onClick={() => link.mutate()}>{t('Connect Telegram')}</Button>
              <Button variant="ghost" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ['telegram-link'] })}>{t("I've tapped Start")}</Button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
