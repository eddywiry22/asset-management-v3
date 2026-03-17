import { createBrowserRouter, Navigate } from 'react-router-dom';
import ProtectedRoute from '../components/layout/ProtectedRoute';
import AdminRoute from '../components/layout/AdminRoute';
import AppLayout from '../components/layout/AppLayout';
import LoginPage from '../modules/auth/pages/LoginPage';
import CategoriesPage from '../modules/categories/pages/CategoriesPage';
import VendorsPage from '../modules/vendors/pages/VendorsPage';
import UomsPage from '../modules/uoms/pages/UomsPage';
import ProductsPage from '../modules/products/pages/ProductsPage';
import StockDashboardPage from '../modules/stock/pages/StockDashboardPage';
import StockAdjustmentsPage from '../modules/adjustments/pages/StockAdjustmentsPage';
import StockAdjustmentDetailPage from '../modules/adjustments/pages/StockAdjustmentDetailPage';
import StockTransfersPage from '../modules/transfers/pages/StockTransfersPage';
import StockTransferDetailPage from '../modules/transfers/pages/StockTransferDetailPage';

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            index: true,
            element: <Navigate to="/dashboard" replace />,
          },
          {
            path: 'dashboard',
            element: (
              <div>
                <h2>Dashboard</h2>
                <p>Welcome. Use the sidebar to manage master data.</p>
              </div>
            ),
          },
          {
            path: 'health',
            element: <div><h3>Frontend OK</h3></div>,
          },
          {
            path: 'stock',
            element: <StockDashboardPage />,
          },
          {
            path: 'stock-adjustments',
            element: <StockAdjustmentsPage />,
          },
          {
            path: 'stock-adjustments/:id',
            element: <StockAdjustmentDetailPage />,
          },
          {
            path: 'stock-transfers',
            element: <StockTransfersPage />,
          },
          {
            path: 'stock-transfers/:id',
            element: <StockTransferDetailPage />,
          },
          // Admin-only pages
          {
            element: <AdminRoute />,
            children: [
              {
                path: 'admin/categories',
                element: <CategoriesPage />,
              },
              {
                path: 'admin/vendors',
                element: <VendorsPage />,
              },
              {
                path: 'admin/uoms',
                element: <UomsPage />,
              },
              {
                path: 'admin/products',
                element: <ProductsPage />,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/login" replace />,
  },
]);

export default router;
