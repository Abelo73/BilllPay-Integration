import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, FlaskConical } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatDate } from '@/lib/format'
import { telegramAdminApi } from '@/lib/telegram-api'

/** Admin → SMS: the Telegram bot's setup, webhook and channel. */
export function AdminTelegramCard() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['admin-telegram'], queryFn: telegramAdminApi.status, refetchInterval: 15_000 })
  const webhook = useMutation({
    mutationFn: telegramAdminApi.connectWebhook,
    onSuccess: () => toast.success('Webhook connected. Send /start to the bot to try it.'),
    onError: (e) => toast.error(e.message),
  })
  const post = useMutation({
    mutationFn: telegramAdminApi.postNow,
    onSuccess: (r) => { toast.success(r.posted ? `Posted ${r.posted} new listing(s)` : 'Nothing new to post'); qc.invalidateQueries({ queryKey: ['admin-telegram'] }) },
    onError: (e) => toast.error(e.message),
  })
  if (!data) return null
  return (
    <Card className={data.configured ? '' : 'border-warning/60'}>
      <CardContent className="space-y-3 py-4 text-sm">
        <div className="flex items-start gap-3">
          {data.configured ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" /> : <FlaskConical className="mt-0.5 size-5 shrink-0 text-warning" />}
          <div className="space-y-1">
            <p className="font-semibold">
              {data.configured ? `Telegram bot @${data.botUsername ?? '?'}` : 'Telegram: test mode, nothing is sent'}
              {' · '}{data.linkedUsers} linked {data.linkedUsers === 1 ? 'person' : 'people'}
            </p>
            <p className="text-muted-foreground">
              {data.configured
                ? <>Channel: {data.channelId || 'off (set TELEGRAM_CHANNEL_ID)'}. Webhook: <code className="text-xs">{data.webhookUrl}</code>{data.webhookSecretSet ? '' : ' (set TELEGRAM_WEBHOOK_SECRET first)'}</>
                : 'Create a bot with @BotFather, then add TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME and TELEGRAM_WEBHOOK_SECRET (and TELEGRAM_CHANNEL_ID for listing posts) to .env and restart the backend.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={webhook.isPending} onClick={() => webhook.mutate()}>Connect webhook</Button>
          <Button size="sm" variant="outline" disabled={post.isPending || !data.channelId} onClick={() => post.mutate()}>Post new listings now</Button>
        </div>
        {!data.configured && data.recent.length > 0 && (
          <details>
            <summary className="cursor-pointer font-medium">Last {data.recent.length} bot messages (test mode)</summary>
            <ul className="mt-2 space-y-1.5">
              {data.recent.map((m, i) => (
                <li key={i} className="rounded-lg bg-muted p-2 text-xs">
                  <span className="text-muted-foreground">{formatDate(m.at)} → {m.chatId}: </span>
                  {m.html.replace(/<[^>]+>/g, '').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  )
}
