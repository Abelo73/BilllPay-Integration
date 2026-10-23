import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'

import { SiteLayout } from '@/components/site-layout'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { CheckoutPage } from '@/pages/checkout'
import { HomePage } from '@/pages/home'
import { NotFoundPage } from '@/pages/not-found'
import { OrderStatusPage } from '@/pages/order-status'
import { ProductPage } from '@/pages/product'
import { ShopPage } from '@/pages/shop'

const AdminApp = lazy(() => import('@/pages/admin/routes'))

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
})

const router = createBrowserRouter([
  {
    path: '/admin/*',
    element: (
      <Suspense
        fallback={
          <div className="grid min-h-svh place-items-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <AdminApp />
      </Suspense>
    ),
  },
  {
    element: <SiteLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/shop', element: <ShopPage /> },
      { path: '/product/:slug', element: <ProductPage /> },
      { path: '/checkout', element: <CheckoutPage /> },
      { path: '/checkout/return', element: <OrderStatusPage /> },
      { path: '/checkout/cancelled', element: <OrderStatusPage cancelled /> },
      { path: '/orders/track', element: <OrderStatusPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster richColors position="top-center" />
      </QueryClientProvider>
    </ThemeProvider>
  )
}
