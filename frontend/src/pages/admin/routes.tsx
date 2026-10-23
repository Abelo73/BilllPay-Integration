import { useRoutes, type RouteObject } from 'react-router'

import { AdminCategoriesPage } from './categories'
import { AdminDashboardPage } from './dashboard'
import { AdminEmailsPage } from './emails'
import { AdminLayout } from './layout'
import { AdminLoginHistoryPage } from './login-history'
import { AdminLoginPage } from './login'
import { AdminMyAccountPage } from './my-account'
import { AdminOrderDetailPage } from './order-detail'
import { AdminOrdersPage } from './orders'
import { AdminPaymentsPage } from './payments'
import { AdminProductEditPage } from './product-edit'
import { AdminProductsPage } from './products'
import { AdminRefundsPage } from './refunds'
import { AdminSetupPage } from './setup'
import { AdminUsersPage } from './users'
import { AdminWebhooksPage } from './webhooks'

const adminRoutes: RouteObject[] = [
  { path: 'login', element: <AdminLoginPage /> },
  {
    element: <AdminLayout />,
    children: [
      { index: true, element: <AdminDashboardPage /> },
      { path: 'orders', element: <AdminOrdersPage /> },
      { path: 'orders/:orderNumber', element: <AdminOrderDetailPage /> },
      { path: 'payments', element: <AdminPaymentsPage /> },
      { path: 'products', element: <AdminProductsPage /> },
      { path: 'products/:productId', element: <AdminProductEditPage /> },
      { path: 'categories', element: <AdminCategoriesPage /> },
      { path: 'webhooks', element: <AdminWebhooksPage /> },
      { path: 'refunds', element: <AdminRefundsPage /> },
      { path: 'emails', element: <AdminEmailsPage /> },
      { path: 'setup', element: <AdminSetupPage /> },
      { path: 'users', element: <AdminUsersPage /> },
      { path: 'login-history', element: <AdminLoginHistoryPage /> },
      { path: 'account', element: <AdminMyAccountPage /> },
    ],
  },
]

/** Mounted at /admin/* and loaded lazily, so shoppers never download the admin bundle. */
export default function AdminApp() {
  return useRoutes(adminRoutes)
}
