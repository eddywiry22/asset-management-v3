import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import { errorMiddleware } from './middlewares/error.middleware';
import logger from './utils/logger';

const app: Application = express();

// Core middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logger
app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.path}`);
  next();
});

// Health check route
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// TODO: Register module routes here as they are implemented.
// Example:
// import authRoutes from './modules/auth/auth.routes';
// app.use('/auth', authRoutes);

// Centralized error handling (must be last)
app.use(errorMiddleware);

export default app;
