import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ImagePlus, Loader2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useOutletContext } from 'react-router'
import { toast } from 'sonner'

import { Card, CardContent } from '@/components/ui/card'
import { sellerApi, type MyShop } from '@/lib/seller-api'
import { ShopLogo } from './layout'
import { ShopForm } from './shop-form'

const MAX_BYTES = 5 * 1024 * 1024
const TYPES = ['image/jpeg', 'image/png', 'image/webp']

function PhotoPicker({ kind, shop }: { kind: 'logo' | 'cover'; shop: MyShop }) {
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const upload = useMutation({
    mutationFn: (file: File) => sellerApi.uploadShopImage(kind, file),
    onSuccess: (s) => {
      qc.setQueryData(['seller-shop'], s)
      toast.success(kind === 'logo' ? 'Logo updated' : 'Cover photo updated')
    },
    onError: (e) => toast.error(e.message),
  })
  const pick = (f: File | undefined) => {
    if (!f) return
    if (!TYPES.includes(f.type)) return toast.error('Use a JPG, PNG or WebP photo.')
    if (f.size > MAX_BYTES) return toast.error('That photo is larger than 5 MB.')
    upload.mutate(f)
  }
  const url = kind === 'logo' ? shop.logoUrl : shop.coverUrl
  return (
    <button
      type="button"
      onClick={() => input.current?.click()}
      disabled={upload.isPending}
      className={
        kind === 'logo'
          ? 'relative shrink-0 overflow-hidden rounded-2xl'
          : 'relative flex h-32 w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed bg-muted/40 text-sm text-muted-foreground sm:h-40'
      }
      aria-label={kind === 'logo' ? 'Change logo' : 'Change cover photo'}
    >
      {kind === 'logo' ? (
        <ShopLogo shop={shop} className="size-20" />
      ) : url ? (
        <img src={url} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <span className="flex items-center gap-2"><ImagePlus className="size-5" /> Add a cover photo</span>
      )}
      <span className="absolute inset-x-0 bottom-0 bg-black/55 py-1 text-center text-[11px] font-semibold text-white">
        {upload.isPending ? <Loader2 className="mx-auto size-3.5 animate-spin" /> : url ? 'Change' : kind === 'logo' ? 'Add logo' : 'Add'}
      </span>
      <input ref={input} type="file" accept={TYPES.join(',')} hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
    </button>
  )
}

export function SellerShopPage() {
  const shop = useOutletContext<MyShop>()
  const qc = useQueryClient()
  const [version, setVersion] = useState(0)
  const save = useMutation({
    mutationFn: sellerApi.updateShop,
    onSuccess: (s) => {
      qc.setQueryData(['seller-shop'], s)
      setVersion((v) => v + 1)
      toast.success(shop.status === 'REJECTED' ? 'Saved and sent back to Sodo Gebeya for approval.' : 'Shop details saved')
    },
    onError: (e) => toast.error(e.message),
  })
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="text-base font-bold">Photos</h2>
          <PhotoPicker kind="cover" shop={shop} />
          <div className="flex items-center gap-4">
            <PhotoPicker kind="logo" shop={shop} />
            <p className="text-sm text-muted-foreground">A square logo or a photo of your shop front. Buyers see it on your shop page.</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-5">
          <ShopForm
            key={version}
            shop={shop}
            submitLabel={shop.status === 'REJECTED' ? 'Save and send again' : 'Save'}
            pending={save.isPending}
            onSubmit={(input) => save.mutate(input)}
          />
        </CardContent>
      </Card>
    </div>
  )
}
