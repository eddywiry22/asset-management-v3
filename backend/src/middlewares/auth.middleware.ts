import { Request, Response, NextFunction } from 'express';
import { AppError } from './error.middleware';

// Placeholder: JWT authentication middleware.
// Full implementation will be added in Phase 2 (Authentication module).
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError(401, 'Unauthorized: missing or invalid token'));
  }

  // TODO: Verify JWT token and attach user context to request.
  next();
}
