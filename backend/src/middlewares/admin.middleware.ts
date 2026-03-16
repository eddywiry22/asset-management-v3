import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../utils/errors';
import { AuthenticatedRequest } from '../types/request.types';

export function adminMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const user = (req as AuthenticatedRequest).user;
  if (!user?.isAdmin) {
    return next(new ForbiddenError('Admin access required'));
  }
  next();
}
