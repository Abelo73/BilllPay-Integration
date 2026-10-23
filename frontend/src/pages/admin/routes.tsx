import { useRoutes, type RouteObject } from 'react-router'

import { AdminDashboardPage } from './dashboard'
import { AdminLayout } from './layout'
import { AdminLoginPage } from './login'
import { AdminOrderDetailPage } from './order-detail'
import { AdminOrdersPage } from './orders'
import { AdminPaymentsPage } from './payments'
import { AdminRefundsPage } from './refunds'
import { AdminSetupPage } from './setup'
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
      { path: 'webhooks', element: <AdminWebhooksPage /> },
      { path: 'refunds', element: <AdminRefundsPage /> },
      { path: 'setup', element: <AdminSetupPage /> },
    ],
  },
]

/** Mounted at /admin/* and loaded lazily, so shoppers never download the admin bundle. */
export default function AdminApp() {
  return useRoutes(adminRoutes)
}
