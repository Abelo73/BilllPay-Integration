import { useQueryClient } from '@tanstack/react-query'
import { Bookmark, Heart, LogOut, Package, UserRound } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useT } from '@/lib/i18n'
import { userContact, useSession } from '@/store/session'

/** "Sign in" for guests; an account menu for signed-in customers. */
export function UserMenu() {
  const t = useT()
  const { session, clear } = useSession()
  const navigate = useNavigate()
  const qc = useQueryClient()

  if (!session) {
    return (
      <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
        <Link to="/login">{t('Sign in')}</Link>
      </Button>
    )
  }

  const signOut = () => {
    clear()
    qc.removeQueries({ queryKey: ['my-orders'] })
    toast.success(t('Signed out'))
    navigate('/')
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('Account menu')}>
          <span className="grid size-7 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {session.user.fullName[0]?.toUpperCase()}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <p className="truncate font-medium">{session.user.fullName}</p>
          <p className="truncate text-xs font-normal text-muted-foreground">{userContact(session.user)}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/account"><Package /> {t('My orders')}</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/favourites"><Heart /> {t('Favourites')}</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/searches"><Bookmark /> {t('Saved searches')}</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/account?tab=profile"><UserRound /> {t('Account settings')}</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut}>
          <LogOut /> {t('Sign out')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
