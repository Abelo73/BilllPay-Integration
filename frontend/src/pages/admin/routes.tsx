import { useRoutes, type RouteObject } from 'react-router'

import { AdminAreasPage } from './areas'
import { AdminCategoriesPage } from './categories'
import { AdminCategoryFieldsPage } from './category-fields'
import { AdminChatReportsPage } from './chat-reports'
import { AdminDashboardPage } from './dashboard'
import { AdminDiscountsPage } from './discounts'
import { AdminEmailsPage } from './emails'
import { AdminFeaturesPage } from './features'
import { AdminFeesPage } from './fees'
import { AdminSmsPage } from './sms'
import { AdminLayout } from './layout'
import { AdminListingReportsPage } from './listing-reports'
import { AdminLoadTestsPage } from './load-tests'
import { AdminLoginHistoryPage } from './login-history'
import { AdminLoginPage } from './login'
import { AdminMyAccountPage } from './my-account'
import { AdminOrderDetailPage } from './order-detail'
import { AdminOrdersPage } from './orders'
import { AdminPaymentsPage } from './payments'
import { AdminPayoutsPage } from './payouts'
import { AdminProblemPage, AdminProblemsPage } from './problems'
import { AdminBannersPage, AdminPromoPage } from './promo'
import { AdminProductEditPage } from './product-edit'
import { AdminProductsPage } from './products'
import { AdminProsPage } from './pros'
import { AdminRefundsPage } from './refunds'
import { AdminReportsPage } from './reports'
import { AdminReviewsPage } from './reviews'
import { AdminSetupPage } from './setup'
import { AdminShopsPage } from './shops'
import { AdminUsersPage } from './users'
import { AdminVerificationsPage } from './verifications'
import { AdminWebhooksPage } from './webhooks'
import { AdminCvOrdersPage, AdminJobsPage, AdminStudentsPage } from './work'

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
      { path: 'categories/:categoryId/fields', element: <AdminCategoryFieldsPage /> },
      { path: 'shops', element: <AdminShopsPage /> },
      { path: 'pros', element: <AdminProsPage /> },
      { path: 'reviews', element: <AdminReviewsPage /> },
      { path: 'chat-reports', element: <AdminChatReportsPage /> },
      { path: 'verifications', element: <AdminVerificationsPage /> },
      { path: 'listing-reports', element: <AdminListingReportsPage /> },
      { path: 'areas', element: <AdminAreasPage /> },
      { path: 'payouts', element: <AdminPayoutsPage /> },
      { path: 'problems', element: <AdminProblemsPage /> },
      { path: 'problems/:id', element: <AdminProblemPage /> },
      { path: 'promo', element: <AdminPromoPage /> },
      { path: 'banners', element: <AdminBannersPage /> },
      { path: 'fees', element: <AdminFeesPage /> },
      { path: 'features', element: <AdminFeaturesPage /> },
      { path: 'jobs', element: <AdminJobsPage /> },
      { path: 'cv-orders', element: <AdminCvOrdersPage /> },
      { path: 'students', element: <AdminStudentsPage /> },
      { path: 'discounts', element: <AdminDiscountsPage /> },
      { path: 'webhooks', element: <AdminWebhooksPage /> },
      { path: 'refunds', element: <AdminRefundsPage /> },
      { path: 'emails', element: <AdminEmailsPage /> },
      { path: 'sms', element: <AdminSmsPage /> },
      { path: 'reports', element: <AdminReportsPage /> },
      { path: 'load-tests', element: <AdminLoadTestsPage /> },
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
