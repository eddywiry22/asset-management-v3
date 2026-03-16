import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import { errorMiddleware } from './middlewares/error.middleware';
import { requestLoggerMiddleware } from './middlewares/request-logger.middleware';
import authRoutes from './modules/auth/auth.routes';

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

// Centralized error handling (must be last)
app.use(errorMiddleware);

export default app;
