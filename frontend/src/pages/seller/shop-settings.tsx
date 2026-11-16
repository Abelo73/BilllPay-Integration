import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useOutletContext } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { ImageCropDialog } from '@/components/image-crop'
import { Card, CardContent } from '@/components/ui/card'
import { useT } from '@/lib/i18n'
import { sellerApi, type MyShop } from '@/lib/seller-api'
import { ShopLogo } from './layout'
import { ShopForm } from './shop-form'

const MAX_BYTES = 5 * 1024 * 1024
const TYPES = ['image/jpeg', 'image/png', 'image/webp']

function PhotoPicker({ kind, shop }: { kind: 'logo' | 'cover'; shop: MyShop }) {
  const t = useT()
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const upload = useMutation({
    mutationFn: (file: File) => sellerApi.uploadShopImage(kind, file),
    onSuccess: (s) => {
      qc.setQueryData(['seller-shop'], s)
      toast.success(kind === 'logo' ? t('Logo updated') : t('Cover photo updated'))
    },
    onError: (e) => toast.error(e.message),
  })
  // the picture is cropped to the shape it will show in before it is sent (logo: square, cover: wide)
  const [picking, setPicking] = useState<File | null>(null)
  const pick = (f: File | undefined) => {
    if (!f) return
    if (!TYPES.includes(f.type)) return toast.error(t('Use a JPG, PNG or WebP photo.'))
    if (f.size > MAX_BYTES) return toast.error(t('That photo is larger than 5 MB.'))
    setPicking(f)
  }
  const url = kind === 'logo' ? shop.logoUrl : shop.coverUrl
  return (
    <>
    <button
      type="button"
      onClick={() => input.current?.click()}
      disabled={upload.isPending}
      className={
        kind === 'logo'
          ? 'relative shrink-0 overflow-hidden rounded-2xl'
          : 'relative flex h-32 w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed bg-muted/40 text-sm text-muted-foreground sm:h-40'
      }
      aria-label={kind === 'logo' ? t('Change logo') : t('Change cover photo')}
    >
      {kind === 'logo' ? (
        <ShopLogo shop={shop} className="size-20" />
      ) : url ? (
        <img src={url} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <span className="flex items-center gap-2"><ImagePlus className="size-5" /> {t('Add a cover photo')}</span>
      )}
      <span className="absolute inset-x-0 bottom-0 bg-black/55 py-1 text-center text-[11px] font-semibold text-white">
        {upload.isPending ? <Loader2 className="mx-auto size-3.5 animate-spin" /> : url ? t('Change') : kind === 'logo' ? t('Add logo') : t('Add')}
      </span>
      <input ref={input} type="file" accept={TYPES.join(',')} hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
    </button>
      {picking && (
        <ImageCropDialog
          file={picking}
          aspect={kind === 'logo' ? 1 : 3}
          round={kind === 'logo'}
          outWidth={kind === 'logo' ? 512 : 1500}
          title={kind === 'logo' ? t('Crop your logo') : t('Crop your cover photo')}
          onCancel={() => setPicking(null)}
          onDone={(f) => { setPicking(null); upload.mutate(f) }}
        />
      )}
    </>
  )
}

/** Instagram, Facebook and Telegram: the name only. Buyers see them as links, with a warning about paying outside the app. */
function SocialCard() {
  const t = useT()
  const qc = useQueryClient()
  const current = useQuery({ queryKey: ['shop-social'], queryFn: sellerApi.shopSocial })
  const [form, setForm] = useState<{ instagram: string; facebook: string; telegram: string } | null>(null)
  const value = form ?? { instagram: current.data?.instagram ?? '', facebook: current.data?.facebook ?? '', telegram: current.data?.telegram ?? '' }
  const save = useMutation({
    mutationFn: () => sellerApi.saveShopSocial({
      instagram: value.instagram.trim() || null,
      facebook: value.facebook.trim() || null,
      telegram: value.telegram.trim() || null,
    }),
    onSuccess: (s) => {
      qc.setQueryData(['shop-social'], s)
      setForm(null)
      toast.success(t('Links saved'))
    },
    onError: (e) => toast.error(e.message),
  })
  const set = (k: keyof typeof value, v: string) => setForm({ ...value, [k]: v })
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="space-y-1">
          <h2 className="text-base font-bold">{t('Social links')}</h2>
          <p className="text-sm text-muted-foreground">{t('Type only the name, for example @marta_boutique. Buyers see the links on your shop page.')}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-sm font-medium">Instagram
            <input className="block h-10 w-full rounded-lg border bg-card px-3 text-sm" value={value.instagram} onChange={(e) => set('instagram', e.target.value)} placeholder="@name" maxLength={60} />
          </label>
          <label className="space-y-1 text-sm font-medium">Facebook
            <input className="block h-10 w-full rounded-lg border bg-card px-3 text-sm" value={value.facebook} onChange={(e) => set('facebook', e.target.value)} placeholder={t('Page name')} maxLength={80} />
          </label>
          <label className="space-y-1 text-sm font-medium">Telegram
            <input className="block h-10 w-full rounded-lg border bg-card px-3 text-sm" value={value.telegram} onChange={(e) => set('telegram', e.target.value)} placeholder="@name" maxLength={40} />
          </label>
        </div>
        <p className="rounded-lg bg-amber-soft px-3 py-2 text-xs text-amber-ink">
          {t('Buyers are told to pay and order inside Sodo Gebeya, never to a social account. Do not ask for money in your posts.')}
        </p>
        <div>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form}>{save.isPending && <Loader2 className="animate-spin" />} {t('Save links')}</Button>
        </div>
      </CardContent>
    </Card>
  )
}

/** The shop gallery: up to six photos of the shop, its stock and its front. Each one is cropped to 4:3 first. */
function GalleryCard() {
  const t = useT()
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [picking, setPicking] = useState<File | null>(null)
  const photos = useQuery({ queryKey: ['shop-gallery'], queryFn: sellerApi.shopGallery })
  const add = useMutation({
    mutationFn: (f: File) => sellerApi.addShopPhoto(f),
    onSuccess: (list) => {
      qc.setQueryData(['shop-gallery'], list)
      setPicking(null)
      toast.success(t('Photo added'))
    },
    onError: (e) => toast.error(e.message),
  })
  const remove = useMutation({
    mutationFn: (id: number) => sellerApi.removeShopPhoto(id),
    onSuccess: (list) => qc.setQueryData(['shop-gallery'], list),
    onError: (e) => toast.error(e.message),
  })
  const list = photos.data ?? []
  const full = list.length >= 6
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">{t('Shop gallery')}</h2>
          <span className="text-xs text-muted-foreground">{list.length}/6</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('Up to six photos of your shop, your stock and your front. Only photos of things and places, never of customers without their consent.')}
        </p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {list.map((p) => (
            <div key={p.id} className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted">
              <img src={p.url} alt="" loading="lazy" className="size-full object-cover" />
              <button
                type="button"
                onClick={() => remove.mutate(p.id)}
                disabled={remove.isPending}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                aria-label={t('Remove photo')}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          {!full && (
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={add.isPending}
              className="grid aspect-[4/3] place-items-center rounded-xl border-2 border-dashed text-muted-foreground hover:border-primary"
              aria-label={t('Add a photo')}
            >
              {add.isPending ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
            </button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) setPicking(f)
            e.target.value = ''
          }}
        />
      </CardContent>
      {picking && (
        <ImageCropDialog file={picking} aspect={4 / 3} outWidth={1200} title={t('Crop your photo')} onCancel={() => setPicking(null)} onDone={(f) => add.mutate(f)} />
      )}
    </Card>
  )
}

export function SellerShopPage() {
  const shop = useOutletContext<MyShop>()
  const qc = useQueryClient()
  const [version, setVersion] = useState(0)
  const t = useT()
  const save = useMutation({
    mutationFn: sellerApi.updateShop,
    onSuccess: (s) => {
      qc.setQueryData(['seller-shop'], s)
      setVersion((v) => v + 1)
      toast.success(shop.status === 'REJECTED' ? t('Saved and sent back to Sodo Gebeya for approval.') : t('Shop details saved'))
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="text-base font-bold">{t('Photos')}</h2>
          <PhotoPicker kind="cover" shop={shop} />
          <div className="flex items-center gap-4">
            <PhotoPicker kind="logo" shop={shop} />
            <p className="text-sm text-muted-foreground">{t('A square logo or a photo of your shop front. Buyers see it on your shop page.')}</p>
          </div>
        </CardContent>
      </Card>
      <GalleryCard />
      <SocialCard />
      <Card>
        <CardContent className="p-5">
          <ShopForm
            key={version}
            shop={shop}
            submitLabel={shop.status === 'REJECTED' ? t('Save and send again') : t('Save')}
            pending={save.isPending}
            onSubmit={(input) => save.mutate(input)}
          />
        </CardContent>
      </Card>
    </div>
  )
}
