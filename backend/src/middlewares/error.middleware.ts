import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import logger from '../utils/logger';
import { AppError, ValidationError } from '../utils/errors';

export function errorMiddleware(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error(`${err.name}: ${err.message}`, {
    path: req.path,
    method: req.method,
    stack: err.stack,
  });

  if (err instanceof ZodError) {
    const zodErr = err as ZodError;
    res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors: zodErr.issues.map((e) => ({ field: e.path.join('.'), message: e.message })),
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
    return;
  }

  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
  });
}

// Re-export error classes for convenience
export { AppError, ValidationError } from '../utils/errors';
