import { Response, NextFunction } from 'express';
import { productLocationService } from './productRegistration.service';
import { AuthenticatedRequest } from '../../types/request.types';

export class ProductLocationController {
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page   = parseInt(req.query.page  as string) || 1;
      const limit  = parseInt(req.query.limit as string) || 20;
      const status = (['ALL', 'ACTIVE', 'INACTIVE'].includes(req.query.status as string)
        ? req.query.status as 'ALL' | 'ACTIVE' | 'INACTIVE'
        : 'ALL');
      const { data, total } = await productLocationService.findAll(page, limit, status);
      res.status(200).json({ success: true, data, meta: { page, limit, total } });
    } catch (err) {
      next(err);
    }
  }

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await productLocationService.create(req.body, req.user.id);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async checkDeactivation(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await productLocationService.checkDeactivation(req.params.id);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await productLocationService.update(req.params.id, req.body, req.user.id);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await productLocationService.delete(req.params.id, req.user.id);
      res.status(200).json({ success: true, message: 'Product registration deleted successfully' });
    } catch (err) {
      next(err);
    }
  }
}

export const productLocationController = new ProductLocationController();
