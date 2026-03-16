import { createBrowserRouter, Navigate } from 'react-router-dom';
import ProtectedRoute from '../components/layout/ProtectedRoute';
import AppLayout from '../components/layout/AppLayout';
import LoginPage from '../modules/auth/pages/LoginPage';
import CategoriesPage from '../modules/categories/pages/CategoriesPage';
import VendorsPage from '../modules/vendors/pages/VendorsPage';
import UomsPage from '../modules/uoms/pages/UomsPage';
import GoodsPage from '../modules/goods/pages/GoodsPage';

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
            path: 'categories',
            element: <CategoriesPage />,
          },
          {
            path: 'vendors',
            element: <VendorsPage />,
          },
          {
            path: 'uoms',
            element: <UomsPage />,
          },
          {
            path: 'goods',
            element: <GoodsPage />,
          },
          {
            path: 'health',
            element: <div><h3>Frontend OK</h3></div>,
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
