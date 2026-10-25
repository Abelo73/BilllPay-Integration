import { useMutation } from '@tanstack/react-query'
import { Loader2, MessageCircle } from 'lucide-react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { chatApi } from '@/lib/chat-api'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useSession } from '@/store/session'

/** Opens (or reopens) the chat with this product's shop. Signed-out shoppers go through sign-in first. */
export function ChatWithSeller({ productId, slug, className }: { productId: number; slug: string; className?: string }) {
  const t = useT()
  const session = useSession((s) => s.session)
  const navigate = useNavigate()
  const start = useMutation({
    mutationFn: () => chatApi.start(productId),
    onSuccess: (c) => navigate(`/chats/${c.id}`),
    onError: (e) => toast.error(e.message),
  })
  return (
    <Button
      variant="outline"
      size="lg"
      className={cn('h-10 border-primary text-primary hover:text-primary', className)}
      disabled={start.isPending}
      onClick={() => (session ? start.mutate() : navigate(`/login?next=${encodeURIComponent(`/product/${slug}`)}`))}
    >
      {start.isPending ? <Loader2 className="animate-spin" /> : <MessageCircle />} {t('Chat with seller')}
    </Button>
  )
}
