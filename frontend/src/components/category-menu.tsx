import { ArrowLeft, ArrowRight, ChevronDown, LayoutGrid } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { categoryLook, countLabel, type MainCategory, useCategoryTree } from '@/lib/category-tree'
import { useT } from '@/lib/i18n'
import { recordInterest } from '@/lib/interests'
import { cn } from '@/lib/utils'

const opened = (c: { slug: string; name: string }) => recordInterest({ kind: 'category', category: c.slug, categoryName: c.name })

/** Desktop: "Categories" opens a panel, main categories on the left, the pointed-at one's sub-categories on the right. */
export function CategoryMegaMenu() {
  const t = useT()
  const { tree } = useCategoryTree()
  const mains = tree.filter((m) => (m.listingCount ?? 0) > 0 || m.children.length > 0)
  const [activeId, setActiveId] = useState<number | null>(null)
  const active = mains.find((m) => m.id === activeId) ?? mains[0]
  if (mains.length === 0) return null
  return (
    <DropdownMenu onOpenChange={(o) => !o && setActiveId(null)}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-10 gap-1.5 rounded-full px-3 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <LayoutGrid className="size-4" /> {t('Categories')} <ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={10} className="w-[min(46rem,calc(100vw-2rem))] rounded-3xl p-0">
        <div className="grid grid-cols-[16rem_1fr]">
          <div className="max-h-[70vh] overflow-y-auto border-r p-2">
            {mains.map((m) => {
              const { icon: Icon, tint } = categoryLook(m.slug)
              return (
                <DropdownMenuItem
                  key={m.id}
                  asChild
                  onPointerEnter={() => setActiveId(m.id)}
                  onFocus={() => setActiveId(m.id)}
                  className={cn('cursor-pointer gap-3 rounded-2xl px-2 py-2', active?.id === m.id && 'bg-accent')}
                >
                  <Link to={`/shop?category=${m.slug}`} onClick={() => opened(m)}>
                    <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br', tint)}><Icon className="size-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{t(m.name)}</span>
                      <span className="block text-[11px] text-muted-foreground">{countLabel(m.listingCount, t)}</span>
                    </span>
                  </Link>
                </DropdownMenuItem>
              )
            })}
          </div>
          {active && <SubPanel main={active} />}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SubPanel({ main }: { main: MainCategory }) {
  const t = useT()
  return (
    <div className="flex max-h-[70vh] flex-col overflow-y-auto p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="text-lg font-extrabold">{t(main.name)}</p>
        <DropdownMenuItem asChild className="w-auto p-0 text-sm font-semibold text-primary focus:bg-transparent">
          <Link to={`/shop?category=${main.slug}`} onClick={() => opened(main)}>
            {t('See all')} <ArrowRight className="size-3.5" />
          </Link>
        </DropdownMenuItem>
      </div>
      {main.children.length === 0 ? (
        <p className="text-sm text-muted-foreground">{countLabel(main.listingCount, t)}</p>
      ) : (
        <div className="grid grid-cols-2 gap-1">
          {main.children.map((c) => (
            <DropdownMenuItem key={c.id} asChild className="cursor-pointer justify-between rounded-xl px-3 py-2">
              <Link to={`/shop?category=${c.slug}`} onClick={() => opened(c)}>
                <span className="truncate text-sm">{t(c.name)}</span>
                <span className="text-xs text-muted-foreground">{(c.listingCount ?? 0).toLocaleString()}</span>
              </Link>
            </DropdownMenuItem>
          ))}
        </div>
      )}
      <div className="mt-auto pt-4">
        <DropdownMenuItem asChild className="w-fit rounded-full border px-4 py-2 text-sm font-semibold">
          <Link to="/categories">{t('All categories')} <ArrowRight className="size-3.5" /></Link>
        </DropdownMenuItem>
      </div>
    </div>
  )
}

/** Phone: a grid icon opens a sheet from the bottom: main categories as tiles, then the picked one's sub-categories. */
export function CategorySheet() {
  const t = useT()
  const { tree } = useCategoryTree()
  const mains = tree.filter((m) => (m.listingCount ?? 0) > 0 || m.children.length > 0)
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<MainCategory | null>(null)
  const close = () => {
    setOpen(false)
    setPicked(null)
  }
  return (
    <Sheet open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="size-11 md:hidden" aria-label={t('Categories')}>
          <LayoutGrid className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <SheetHeader className="text-left">
          {picked ? (
            <button type="button" onClick={() => setPicked(null)} className="flex min-h-11 w-fit items-center gap-1 text-sm font-semibold text-primary">
              <ArrowLeft className="size-4" /> {t('All categories')}
            </button>
          ) : null}
          <SheetTitle>{picked ? t(picked.name) : t('Categories')}</SheetTitle>
          <SheetDescription>{picked ? countLabel(picked.listingCount, t) : t('What are you looking for?')}</SheetDescription>
        </SheetHeader>
        {!picked ? (
          <div className="grid grid-cols-3 gap-2 px-4">
            {mains.map((m) => {
              const { icon: Icon, tint } = categoryLook(m.slug)
              const content = (
                <>
                  <span className={cn('grid size-12 place-items-center rounded-2xl bg-gradient-to-br', tint)}><Icon className="size-6" /></span>
                  <span className="line-clamp-2 text-center text-xs font-semibold leading-tight">{t(m.name)}</span>
                </>
              )
              const tile = 'flex min-h-24 flex-col items-center justify-start gap-2 rounded-2xl border bg-card p-2 pt-3 active:scale-95'
              return m.children.length > 0 ? (
                <button key={m.id} type="button" className={tile} onClick={() => setPicked(m)}>{content}</button>
              ) : (
                <Link key={m.id} to={`/shop?category=${m.slug}`} className={tile} onClick={() => { opened(m); close() }}>{content}</Link>
              )
            })}
          </div>
        ) : (
          <ul className="grid gap-1 px-4">
            <li>
              <Link to={`/shop?category=${picked.slug}`} onClick={() => { opened(picked); close() }}
                className="flex min-h-12 items-center justify-between rounded-xl bg-accent px-4 font-semibold">
                {t('Everything in {name}', { name: t(picked.name) })} <ArrowRight className="size-4" />
              </Link>
            </li>
            {picked.children.map((c) => (
              <li key={c.id}>
                <Link to={`/shop?category=${c.slug}`} onClick={() => { opened(c); close() }}
                  className="flex min-h-12 items-center justify-between rounded-xl px-4 hover:bg-muted">
                  <span>{t(c.name)}</span>
                  <span className="text-xs text-muted-foreground">{(c.listingCount ?? 0).toLocaleString()}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="px-4 pt-4">
          <Link to="/categories" onClick={close} className="flex min-h-11 items-center justify-center gap-1 rounded-full border text-sm font-semibold">
            {t('Open the full list')} <ArrowRight className="size-4" />
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  )
}
