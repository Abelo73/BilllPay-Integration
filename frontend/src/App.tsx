import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'

import { SiteLayout } from '@/components/site-layout'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { AccountPage } from '@/pages/account'
import { ChatPage } from '@/pages/chat'
import { ChatsPage } from '@/pages/chats'
import { NotificationsPage } from '@/pages/notifications'
import { JobPage, MyJobsPage, NewJobPage } from '@/pages/jobs'
import { ProDashboardPage } from '@/pages/pro-dashboard'
import { ProProfilePage, ServicesPage } from '@/pages/services'
import { LoginPage, RegisterPage } from '@/pages/auth'
import { CheckoutPage } from '@/pages/checkout'
import { HomePage } from '@/pages/home'
import { NotFoundPage } from '@/pages/not-found'
import { OrderStatusPage } from '@/pages/order-status'
import { ProductPage } from '@/pages/product'
import { ShopPage } from '@/pages/shop'
import { ShopPublicPage } from '@/pages/shop-page'

const AdminApp = lazy(() => import('@/pages/admin/routes'))
const SellerApp = lazy(() => import('@/pages/seller/routes'))
const SellPage = lazy(() => import('@/pages/seller/sell').then((m) => ({ default: m.SellPage })))

const spinner = (
  <div className="grid min-h-[50vh] place-items-center">
    <Loader2 className="size-6 animate-spin text-muted-foreground" />
  </div>
)

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
      { path: '/shops/:slug', element: <ShopPublicPage /> },
      { path: '/sell', element: <Suspense fallback={spinner}><SellPage /></Suspense> },
      { path: '/seller/*', element: <Suspense fallback={spinner}><SellerApp /></Suspense> },
      { path: '/checkout', element: <CheckoutPage /> },
      { path: '/checkout/return', element: <OrderStatusPage /> },
      { path: '/checkout/cancelled', element: <OrderStatusPage cancelled /> },
      { path: '/orders/track', element: <OrderStatusPage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      { path: '/account', element: <AccountPage /> },
      { path: '/chats', element: <ChatsPage /> },
      { path: '/chats/:id', element: <ChatPage /> },
      { path: '/notifications', element: <NotificationsPage /> },
      { path: '/services', element: <ServicesPage /> },
      { path: '/pros/:id', element: <ProProfilePage /> },
      { path: '/jobs', element: <MyJobsPage /> },
      { path: '/jobs/new', element: <NewJobPage /> },
      { path: '/jobs/:id', element: <JobPage /> },
      { path: '/pro', element: <ProDashboardPage /> },
      { path: '/pro/jobs/:id', element: <JobPage /> },
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
