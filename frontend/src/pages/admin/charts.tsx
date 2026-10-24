import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { cn } from '@/lib/utils'

/*
 * Chart building blocks for the admin. Every chart here shows ONE series, so it uses one color: the brand chart
 * blue (--chart-1, stepped separately for dark mode in index.css). Text never takes the series color; grid and axes
 * stay recessive; every plotted chart has a hover tooltip. Status colors (success / destructive) appear only where
 * the value means good or bad, and always next to an icon or text.
 */

export const SERIES = 'var(--chart-1)'

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
export const formatCompact = (n: number) => compact.format(n)

export function formatDay(day: string, withWeekday = false) {
  const d = new Date(`${day}T00:00:00`)
  return d.toLocaleDateString('en', withWeekday ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' })
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** Animates a number from its previous value to the new one (instant when the viewer prefers reduced motion). */
export function useCountUp(target: number, duration = 700) {
  const [value, setValue] = useState(target)
  const from = useRef(target)
  useEffect(() => {
    if (prefersReducedMotion() || from.current === target) {
      from.current = target
      setValue(target)
      return
    }
    const start = performance.now()
    const begin = from.current
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(begin + (target - begin) * eased)
      if (t < 1) frame = requestAnimationFrame(tick)
      else from.current = target
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, duration])
  return value
}

/**
 * Change vs the previous period. {@code goodWhenUp=false} for numbers where growth is bad (refunds).
 * {@code points}: show the difference in percentage points (for rates) instead of a relative change.
 */
export function Delta({ current, previous, goodWhenUp = true, points = false, label }: {
  current: number
  /** undefined (e.g. an older backend): no badge */
  previous: number | undefined
  goodWhenUp?: boolean
  points?: boolean
  label: string
}) {
  if (previous === undefined || previous === null) return null
  if (!points && previous === 0) {
    return <span className="text-xs text-muted-foreground">{current === 0 ? `No change ${label}` : `New ${label}`}</span>
  }
  const change = points ? (current - previous) * 100 : ((current - previous) / previous) * 100
  const flat = Math.abs(change) < 0.5
  const good = flat ? null : change > 0 === goodWhenUp
  const Icon = flat ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span
        className={cn(
          'inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 font-medium tabular-nums',
          good === null ? 'bg-muted text-muted-foreground' : good ? 'bg-success/15 text-success' : 'bg-destructive/10 text-destructive',
        )}
      >
        <Icon className="size-3" />
        {flat ? '0' : `${change > 0 ? '+' : ''}${change.toFixed(Math.abs(change) < 10 ? 1 : 0)}`}
        {points ? ' pts' : '%'}
      </span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  )
}

/** Tiny trend line for a stat tile: shape only, the number above it is the value. */
export function Sparkline({ data, dataKey, className }: { data: Record<string, number | string>[]; dataKey: string; className?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <div className={cn('chart-reveal h-10 w-full', className)} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES} stopOpacity={0.28} />
              <stop offset="100%" stopColor={SERIES} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={SERIES}
            strokeWidth={1.5}
            fill={`url(#spark-${id})`}
            isAnimationActive={false /* the wrapper wipes in instead: recharts' own draw-in can stall before the size is known */}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

type TooltipRow = { label: string; value: string }

/** Card-styled tooltip; rows are label + value in text colors, with a series swatch for identity. */
export function ChartTooltipCard({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div className="min-w-40 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg">
      <p className="mb-1.5 font-medium">{title}</p>
      <div className="space-y-1">
        {rows.map((r, i) => (
          <div key={r.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              {i === 0 && <span className="size-2 rounded-sm" style={{ background: SERIES }} />}
              {r.label}
            </span>
            <span className="font-medium tabular-nums">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Change over time for one measure: area with a soft gradient, horizontal grid only, crosshair + tooltip on hover.
 * {@code tooltipRows} builds the tooltip for a hovered point (it can show related numbers too).
 */
export function TrendChart({
  data,
  dataKey,
  tooltipRows,
  height = 300,
}: {
  data: (Record<string, number | string> & { day: string })[]
  dataKey: string
  tooltipRows: (point: Record<string, number | string>) => TooltipRow[]
  height?: number
}) {
  const id = useId().replace(/:/g, '')
  const many = data.length > 31
  return (
    <div style={{ height }} className="chart-reveal w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`trend-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES} stopOpacity={0.3} />
              <stop offset="95%" stopColor={SERIES} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
          <XAxis
            dataKey="day"
            tickFormatter={(d: string) => formatDay(d)}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={many ? 32 : 18}
            tickMargin={8}
          />
          <YAxis
            tickFormatter={(n: number) => formatCompact(n)}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={44}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1, strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              const point = active && payload?.[0]?.payload
              if (!point) return null
              return <ChartTooltipCard title={formatDay(String(point.day), true)} rows={tooltipRows(point)} />
            }}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={SERIES}
            strokeWidth={2}
            fill={`url(#trend-${id})`}
            activeDot={{ r: 4.5, stroke: 'var(--card)', strokeWidth: 2, fill: SERIES }}
            isAnimationActive={false /* the wrapper wipes in instead: recharts' own draw-in can stall before the size is known */}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export type BarRow = { key: string; label: React.ReactNode; value: number; display: string; hint?: string; href?: string }

/**
 * Ranked horizontal bars as plain HTML: label on the left, value text on the right, bar underneath. Bars grow in on
 * mount, and each row shows its exact numbers on hover (title) as well as in text, so nothing relies on color alone.
 */
export function BarList({ rows, color = SERIES, max, empty, onRow }: {
  rows: BarRow[]
  color?: string
  max?: number
  empty: string
  onRow?: (row: BarRow) => void
}) {
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    const t = requestAnimationFrame(() => setGrown(true))
    return () => cancelAnimationFrame(t)
  }, [])
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
  const top = max ?? Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => {
        const Row = onRow ? 'button' : 'div'
        return (
          <li key={r.key}>
            <Row
              type={onRow ? 'button' : undefined}
              onClick={onRow ? () => onRow(r) : undefined}
              title={r.hint}
              className={cn('block w-full rounded-md text-left', onRow && '-mx-1.5 px-1.5 py-1 transition-colors hover:bg-muted')}
            >
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{r.label}</span>
                <span className="shrink-0 font-medium tabular-nums">{r.display}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
                  style={{ width: grown ? `${Math.max(2, (r.value / top) * 100)}%` : '0%', background: color, transitionDelay: `${i * 40}ms` }}
                />
              </div>
            </Row>
          </li>
        )
      })}
    </ul>
  )
}
