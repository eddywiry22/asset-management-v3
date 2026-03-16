import { Request, Response, NextFunction } from 'express';
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

  if (err instanceof AppError) {
    const code = err.name
      .replace(/([A-Z])/g, '_$1')
      .toUpperCase()
      .replace(/^_/, '');

    res.status(err.statusCode).json({
      success: false,
      error: {
        code,
        message: err.message,
      },
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    },
  });
}

// Re-export error classes for convenience
export { AppError, ValidationError } from '../utils/errors';
