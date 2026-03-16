import { createBrowserRouter } from 'react-router-dom';

// TODO: Import and register page components as they are implemented.
// Routes will follow the structure defined in /doc/frontend_architecture.md:
//   /login
//   /dashboard
//   /stock
//   /adjustments
//   /movements
//   /admin/products
//   /admin/vendors
//   /admin/categories
//   /admin/locations
//   /admin/users
//   /audit-logs

const router = createBrowserRouter([
  {
    path: '/',
    element: <div style={{ padding: 24 }}><h2>Asset Management System</h2><p>Application skeleton ready. Module pages will be added in upcoming phases.</p></div>,
  },
  {
    path: '/health',
    element: <div style={{ padding: 24 }}><h3>Frontend OK</h3></div>,
  },
]);

export default router;
