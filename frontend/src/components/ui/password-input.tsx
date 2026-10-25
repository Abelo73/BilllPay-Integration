import { Eye, EyeOff, Lock, type LucideIcon } from 'lucide-react'
import * as React from 'react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type InputProps = React.ComponentProps<typeof Input>

/** An input with an icon on the left (e.g. Mail for email fields). */
export function IconInput({ icon: Icon, className, ...props }: InputProps & { icon: LucideIcon }) {
  return (
    <div className="relative">
      <Icon aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input className={cn('pl-9', className)} {...props} />
    </div>
  )
}

/** A password field with a lock icon and a show/hide button. */
export function PasswordInput({ className, icon = true, ...props }: Omit<InputProps, 'type'> & { icon?: boolean }) {
  const [shown, setShown] = React.useState(false)
  return (
    <div className="relative">
      {icon && <Lock aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />}
      <Input type={shown ? 'text' : 'password'} className={cn('pr-10', icon && 'pl-9', className)} {...props} />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
        className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}
