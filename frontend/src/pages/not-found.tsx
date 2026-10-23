import { Link } from 'react-router'

import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <p className="text-6xl font-semibold text-brand">404</p>
      <h1 className="text-2xl font-semibold">We couldn’t find that page</h1>
      <p className="text-muted-foreground">It may have moved, or the link is wrong.</p>
      <Button asChild>
        <Link to="/">Back home</Link>
      </Button>
    </div>
  )
}
