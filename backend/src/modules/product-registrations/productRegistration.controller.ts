import { Response, NextFunction } from 'express';
import { productLocationService } from './productRegistration.service';
import { listProductRegistrationSchema } from './productRegistration.validator';
import { AuthenticatedRequest } from '../../types/request.types';
import { ValidationError } from '../../utils/errors';

export class ProductLocationController {
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = listProductRegistrationSchema.safeParse(req.query);
      if (!parsed.success) {
        const msgs = parsed.error.issues?.map((e: any) => e.message) ?? [parsed.error.message];
        throw new ValidationError(msgs.join(', '));
      }

      const { productId, locationId, productIds, locationIds, categoryIds, status, page, pageSize } = parsed.data;

      const normalizedProductIds  = productIds  ?? (productId  ? [productId]  : undefined);
      const normalizedLocationIds = locationIds ?? (locationId ? [locationId] : undefined);
      const normalizedCategoryIds = categoryIds?.length ? categoryIds : undefined;

      const { data, total } = await productLocationService.findAll({
        page,
        pageSize,
        status,
        productIds:  normalizedProductIds,
        locationIds: normalizedLocationIds,
        categoryIds: normalizedCategoryIds,
      });

      res.status(200).json({
        success: true,
        data,
        meta: { page, pageSize, total },
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
