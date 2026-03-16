import { Request, Response, NextFunction } from 'express';
import { authService } from '../modules/auth/auth.service';
import { AuthError } from '../utils/errors';
import { AuthenticatedRequest } from '../types/request.types';

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AuthError('Missing or invalid authorization header'));
  }

  const token = authHeader.slice(7);

  try {
    const payload = authService.verifyAccessToken(token);
    (req as AuthenticatedRequest).user = {
      id: payload.sub,
      email: payload.email,
      phone: payload.phone,
      isActive: true,
    };
    next();
  } catch (err) {
    next(err);
  }
}
