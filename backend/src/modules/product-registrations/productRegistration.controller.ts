import { Response, NextFunction } from 'express';
import { productLocationService } from './productRegistration.service';
import { AuthenticatedRequest } from '../../types/request.types';
import { ValidationError } from '../../utils/errors';

export class ProductLocationController {
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        page       = '1',
        pageSize   = '20',
        status     = 'ALL',
        productId,
        locationId,
      } = req.query as Record<string, string | undefined>;

      const pageNum     = Math.max(1, parseInt(page, 10) || 1);
      const pageSizeNum = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20));

      if (pageNum < 1)     throw new ValidationError('page must be >= 1');
      if (pageSizeNum > 100) throw new ValidationError('pageSize must be <= 100');

      const statusVal = (['ALL', 'ACTIVE', 'INACTIVE'].includes(status)
        ? status as 'ALL' | 'ACTIVE' | 'INACTIVE'
        : 'ALL');

      const { data, total } = await productLocationService.findAll({
        page:       pageNum,
        pageSize:   pageSizeNum,
        status:     statusVal,
        productId:  productId  ?? undefined,
        locationId: locationId ?? undefined,
      });

      res.status(200).json({
        success: true,
        data,
        meta: { page: pageNum, pageSize: pageSizeNum, total },
      });
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

  async bulkToggle(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await productLocationService.bulkToggle(req.body, req.user.id);
      res.status(200).json({ success: true, data: result });
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
