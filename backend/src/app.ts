import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import { errorMiddleware } from './middlewares/error.middleware';
import { requestLoggerMiddleware } from './middlewares/request-logger.middleware';
import authRoutes from './modules/auth/auth.routes';
import categoriesRoutes from './modules/categories/categories.routes';
import vendorsRoutes from './modules/vendors/vendors.routes';
import uomsRoutes from './modules/uoms/uoms.routes';
import goodsRoutes from './modules/goods/goods.routes';

const app: Application = express();

// Core middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(requestLoggerMiddleware);

// Health check route
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Module routes
app.use('/auth', authRoutes);
app.use('/categories', categoriesRoutes);
app.use('/vendors', vendorsRoutes);
app.use('/uoms', uomsRoutes);
app.use('/goods', goodsRoutes);

// Centralized error handling (must be last)
app.use(errorMiddleware);

export default app;
