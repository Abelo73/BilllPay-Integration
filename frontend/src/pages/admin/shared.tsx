import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const TONES: Record<string, string> = {
  PAID: 'bg-success/15 text-success border-success/30',
  SUCCEEDED: 'bg-success/15 text-success border-success/30',
  PROCESSED: 'bg-success/15 text-success border-success/30',
  PENDING_PAYMENT: 'bg-brand/10 text-brand border-brand/30',
  PENDING: 'bg-brand/10 text-brand border-brand/30',
  CREATED: 'bg-brand/10 text-brand border-brand/30',
  RECEIVED: 'bg-brand/10 text-brand border-brand/30',
  PUBLISHED: 'bg-brand/10 text-brand border-brand/30',
  REQUESTED: 'bg-brand/10 text-brand border-brand/30',
  PAYMENT_FAILED: 'bg-destructive/10 text-destructive border-destructive/30',
  FAILED: 'bg-destructive/10 text-destructive border-destructive/30',
  REFUSED: 'bg-destructive/10 text-destructive border-destructive/30',
  REJECTED: 'bg-destructive/10 text-destructive border-destructive/30',
  ERROR: 'bg-destructive/10 text-destructive border-destructive/30',
  REVIEW_REQUIRED: 'bg-warning/15 text-foreground border-warning/40',
  DUPLICATE: 'bg-warning/15 text-foreground border-warning/40',
  PARTIALLY_REFUNDED: 'bg-chart-5/10 text-foreground',
  REFUNDED: 'bg-chart-5/10 text-foreground',
  // delivery
  UNFULFILLED: 'bg-warning/15 text-foreground border-warning/40',
  PROCESSING: 'bg-brand/10 text-brand border-brand/30',
  SHIPPED: 'bg-brand/10 text-brand border-brand/30',
  DELIVERED: 'bg-success/15 text-success border-success/30',
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn('font-mono text-[11px] uppercase', TONES[status])}>
      {status.replaceAll('_', ' ')}
    </Badge>
  )
}

function pretty(raw: string | null) {
  if (!raw) return ''
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

export function JsonBlock({ label, raw }: { label: string; raw: string | null }) {
  const [copied, setCopied] = useState(false)
  if (!raw) return null
  const text = pretty(raw)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Copy ${label}`}
          onClick={() => {
            navigator.clipboard.writeText(text).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            })
          }}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
      <pre className="max-h-80 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed">{text}</pre>
    </div>
  )
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  )
}

export function Pager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-end gap-2 pt-4">
      <Button variant="outline" size="sm" disabled={page === 0} onClick={() => onPage(page - 1)}>
        Previous
      </Button>
      <span className="text-xs text-muted-foreground">
        {page + 1} / {totalPages}
      </span>
      <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => onPage(page + 1)}>
        Next
      </Button>
    </div>
  )
}

export function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-10 text-center text-sm text-muted-foreground">
        {text}
      </td>
    </tr>
  )
}
