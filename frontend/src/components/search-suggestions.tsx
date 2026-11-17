import { useQuery } from '@tanstack/react-query'
import { Clock, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'

import { api } from '@/lib/api'
import { forgetSearches, recentSearches } from '@/lib/recent-searches'
import { formatETB } from '@/lib/format'
import { useT } from '@/lib/i18n'

/**
 * Under the search box: recent searches when it is empty; while typing, a "search for" line and the first matching
 * products. Mouse-down (not click) is used so the box keeps focus while a row is picked.
 */
export function SearchSuggestions({ term, onPick }: { term: string; onPick: (term: string) => void }) {
  const t = useT()
  const typed = term.trim()
  const [debounced, setDebounced] = useState(typed)
  const [recent, setRecent] = useState<string[]>(() => recentSearches())

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(typed), 250)
    return () => window.clearTimeout(id)
  }, [typed])

  const matches = useQuery({
    queryKey: ['search-suggest', debounced],
    queryFn: () => api.products({ q: debounced, size: 5, sort: 'newest' }),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  })

  return (
    <div role="listbox" aria-label={t('Search suggestions')} className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-xl border bg-card shadow-lg" onMouseDown={(e) => e.preventDefault()}>
      {typed.length < 2 ? (
        recent.length > 0 ? (
          <div className="py-1">
            <div className="flex items-center justify-between px-3 py-1.5">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t('Recent searches')}</p>
              <button
                type="button"
                className="text-xs font-semibold text-brand hover:underline"
                onClick={() => {
                  forgetSearches()
                  setRecent([])
                }}
              >
                {t('Clear')}
              </button>
            </div>
            {recent.map((r) => (
              <button key={r} type="button" onClick={() => onPick(r)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-accent">
                <Clock className="size-4 shrink-0 text-muted-foreground" /> <span className="truncate">{r}</span>
              </button>
            ))}
          </div>
        ) : null
      ) : (
        <div className="py-1">
          <button type="button" onClick={() => onPick(typed)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-semibold hover:bg-accent">
            <Search className="size-4 shrink-0 text-brand" /> {t('Search for “{term}”', { term: typed })}
          </button>
          {matches.data?.content.map((p) => (
            <Link key={p.id} to={`/product/${p.slug}`} className="flex items-center gap-3 px-3 py-2 hover:bg-accent">
              {p.imageUrl ? <img src={p.imageUrl} alt="" className="size-10 shrink-0 rounded-lg object-cover" /> : <span className="size-10 shrink-0 rounded-lg bg-muted" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{p.name}</span>
                <span className="block text-xs tabular-nums text-muted-foreground">{formatETB(p.price)}</span>
              </span>
            </Link>
          ))}
          {matches.data && matches.data.content.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">{t('No products match yet. Press search to see all results.')}</p>}
        </div>
      )}
    </div>
  )
}
