import express, { Application, Request, Response, Router } from 'express';
import cors from 'cors';
import { errorMiddleware } from './middlewares/error.middleware';
import { requestLoggerMiddleware } from './middlewares/request-logger.middleware';
import { authMiddleware } from './middlewares/auth.middleware';
import { adminMiddleware } from './middlewares/admin.middleware';
import authRoutes from './modules/auth/auth.routes';
import categoriesRoutes from './modules/categories/categories.routes';
import vendorsRoutes from './modules/vendors/vendors.routes';
import uomsRoutes from './modules/uoms/uoms.routes';
import productsRoutes from './modules/products/products.routes';
import stockRoutes from './modules/stock/stock.routes';

const app: Application = express();

// Core middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(requestLoggerMiddleware);

// Health check (unversioned)
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// /v1/admin/* — requires auth + admin role
const adminRouter = Router();
adminRouter.use(authMiddleware);
adminRouter.use(adminMiddleware);
adminRouter.use('/categories', categoriesRoutes);
adminRouter.use('/vendors',    vendorsRoutes);
adminRouter.use('/uoms',       uomsRoutes);
adminRouter.use('/products',   productsRoutes);

// /v1 router
const v1Router = Router();
v1Router.use('/auth',  authRoutes);
v1Router.use('/admin', adminRouter);

// /v1/stock — requires auth, accessible by all roles
v1Router.use('/stock', authMiddleware, stockRoutes);

app.use('/v1', v1Router);

// Centralized error handling (must be last)
app.use(errorMiddleware);

export default app;
