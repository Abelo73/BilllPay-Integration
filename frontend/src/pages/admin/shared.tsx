import { Check, ChevronLeft, ChevronRight, Copy } from 'lucide-react'
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
  SENT: 'bg-success/15 text-success border-success/30',
  SKIPPED: 'bg-muted text-muted-foreground',
  LOGGED: 'bg-warning/20 text-foreground border-warning/40',
  // delivery
  UNFULFILLED: 'bg-warning/15 text-foreground border-warning/40',
  PROCESSING: 'bg-brand/10 text-brand border-brand/30',
  SHIPPED: 'bg-brand/10 text-brand border-brand/30',
  DELIVERED: 'bg-success/15 text-success border-success/30',
  // discount codes
  LIVE: 'bg-success/15 text-success border-success/30',
  EXPIRED: 'bg-muted text-muted-foreground',
  USED_UP: 'bg-muted text-muted-foreground',
  INACTIVE: 'bg-muted text-muted-foreground',
  NOT_STARTED: 'bg-brand/10 text-brand border-brand/30',
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
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 space-y-0.5">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  )
}

/** Page numbers to show: always first and last, a window around the current page, gaps as null. */
function pageWindow(page: number, totalPages: number): (number | null)[] {
  const pages = new Set([0, totalPages - 1, page - 1, page, page + 1].filter((p) => p >= 0 && p < totalPages))
  const sorted = [...pages].sort((a, b) => a - b)
  const out: (number | null)[] = []
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(null)
    out.push(p)
  })
  return out
}

const PAGE_SIZES = [20, 50, 100]

/**
 * Pagination bar: "Showing 21–40 of 132", numbered pages with first/last, and an optional page-size picker.
 * Pass total/size from the page response to show the range; pass onSize to let staff choose rows per page.
 */
export function Pager({
  page,
  totalPages,
  onPage,
  total,
  size,
  onSize,
}: {
  page: number
  totalPages: number
  onPage: (p: number) => void
  total?: number
  size?: number
  onSize?: (size: number) => void
}) {
  if (totalPages <= 1 && !onSize) {
    return total !== undefined && total > 0 ? (
      <p className="pt-3 text-right text-xs text-muted-foreground tabular-nums">{total} {total === 1 ? 'row' : 'rows'}</p>
    ) : null
  }
  const from = total !== undefined && size ? page * size + 1 : null
  const to = total !== undefined && size ? Math.min(total, (page + 1) * size) : null
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
      <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
        {from !== null && total ? <span>Showing {from}–{to} of {total}</span> : <span>Page {page + 1} of {totalPages}</span>}
        {onSize && size && (
          <label className="flex items-center gap-1.5">
            Rows
            <select
              className="h-7 rounded-md border bg-background px-1.5 text-xs text-foreground"
              value={size}
              onChange={(e) => onSize(Number(e.target.value))}
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {totalPages > 1 && (
        <nav className="flex items-center gap-1" aria-label="Pages">
          <Button variant="outline" size="icon-sm" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Previous page">
            <ChevronLeft />
          </Button>
          {pageWindow(page, totalPages).map((p, i) =>
            p === null ? (
              <span key={`gap-${i}`} className="px-1 text-xs text-muted-foreground">…</span>
            ) : (
              <Button
                key={p}
                variant={p === page ? 'default' : 'ghost'}
                size="icon-sm"
                className="tabular-nums"
                aria-current={p === page ? 'page' : undefined}
                onClick={() => onPage(p)}
              >
                {p + 1}
              </Button>
            ),
          )}
          <Button variant="outline" size="icon-sm" disabled={page + 1 >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page">
            <ChevronRight />
          </Button>
        </nav>
      )}
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
