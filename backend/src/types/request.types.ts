import { Request } from 'express';
import { AuthUser } from './auth.types';

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}
