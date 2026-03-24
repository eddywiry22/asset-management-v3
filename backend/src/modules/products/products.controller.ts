import { Response, NextFunction } from 'express';
import { productsService } from './products.service';
import { productQuerySchema } from './products.validator';
import { AuthenticatedRequest } from '../../types/request.types';

function toArray(value?: string | string[]): string[] | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value : [value];
}

export class ProductsController {
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = productQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const { page, limit, search } = parsed.data;
      const categoryIds = toArray(parsed.data.categoryIds);
      const vendorIds   = toArray(parsed.data.vendorIds);

      const { data, total } = await productsService.findAll({
        page, limit, search, categoryIds, vendorIds,
      });
      res.status(200).json({ success: true, data, meta: { page, limit, total } });
    } catch (err) {
      next(err);
    }
  }

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await productsService.create(req.body, req.user.id);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await productsService.update(req.params.id, req.body, req.user.id);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
}

export const productsController = new ProductsController();
