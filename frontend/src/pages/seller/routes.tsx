import { useRoutes, type RouteObject } from 'react-router'

import { SellerHomePage } from './home'
import { SellerLayout } from './layout'
import { SellerMoneyPage } from './money'
import { SellerOrderPage, SellerOrdersPage } from './orders'
import { SellerProductEditPage, SellerProductsPage } from './products'
import { SellerShopPage } from './shop-settings'
import { SellerProblemsPage } from '../problem'
import { SellerVerifyPage } from './verify'

const sellerRoutes: RouteObject[] = [
  {
    element: <SellerLayout />,
    children: [
      { index: true, element: <SellerHomePage /> },
      { path: 'orders', element: <SellerOrdersPage /> },
      { path: 'orders/:orderNumber', element: <SellerOrderPage /> },
      { path: 'products', element: <SellerProductsPage /> },
      { path: 'products/:productId', element: <SellerProductEditPage /> },
      { path: 'money', element: <SellerMoneyPage /> },
      { path: 'problems', element: <SellerProblemsPage /> },
      { path: 'shop', element: <SellerShopPage /> },
      { path: 'verify', element: <SellerVerifyPage /> },
    ],
  },
]

/** Mounted at /seller/* and loaded lazily, so buyers don't download the seller screens. */
export default function SellerApp() {
  return useRoutes(sellerRoutes)
}
