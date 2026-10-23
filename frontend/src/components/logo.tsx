import { ShoppingBag } from 'lucide-react'
import { Link } from 'react-router'

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <ShoppingBag className="size-4" />
      </span>
      <span className="text-lg">
        Tena<span className="text-brand">Shop</span>
      </span>
    </Link>
  )
}
