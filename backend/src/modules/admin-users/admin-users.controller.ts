import { Response, NextFunction } from 'express';
import { adminUsersService } from './admin-users.service';
import { AuthenticatedRequest } from '../../types/request.types';
import { Role } from '@prisma/client';

export class AdminUsersController {
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { status, role, locationId } = req.query as Record<string, string | undefined>;

      const filter = {
        status: (['ACTIVE', 'INACTIVE', 'ALL'].includes(status ?? '') ? status : 'ALL') as
          | 'ACTIVE'
          | 'INACTIVE'
          | 'ALL',
        role: (['OPERATOR', 'MANAGER'].includes(role ?? '') ? (role as Role) : undefined),
        locationId: locationId ?? undefined,
      };

      const data = await adminUsersService.findAll(filter);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await adminUsersService.create(req.body, req.user.id);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await adminUsersService.update(req.params.id, req.body, req.user.id);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async toggleActive(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await adminUsersService.toggleActive(req.params.id, req.user.id);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
}

export const adminUsersController = new AdminUsersController();
