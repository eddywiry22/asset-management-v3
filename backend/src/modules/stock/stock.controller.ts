import { Response, NextFunction } from 'express';
import { stockService } from './stock.service';
import { stockQuerySchema, ledgerQuerySchema } from './stock.validator';
import { AuthenticatedRequest } from '../../types/request.types';
import { ValidationError } from '../../utils/errors';

export class StockController {
  async getStockOverview(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = stockQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        const msgs = parsed.error.issues?.map((e: any) => e.message) ?? [parsed.error.message];
        throw new ValidationError(msgs.join(', '));
      }

      const { locationId, page, limit, startDate, endDate } = parsed.data;

      const { data, total } = await stockService.getStockOverview(
        {
          locationId,
          page,
          limit,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate:   endDate   ? new Date(endDate)   : undefined,
        },
        req.user.id,
        req.user.isAdmin,
      );

      res.status(200).json({
        success: true,
        data,
        meta: { page, limit, total },
      });
    } catch (err) {
      next(err);
    }
  }

  async getLedger(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = ledgerQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        const msgs = parsed.error.issues?.map((e: any) => e.message) ?? [parsed.error.message];
        throw new ValidationError(msgs.join(', '));
      }

      const { productId, locationId, startDate, endDate, page, limit } = parsed.data;

      const { data, total } = await stockService.getLedger(
        {
          productId,
          locationId,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate:   endDate   ? new Date(endDate)   : undefined,
          page,
          limit,
        },
        req.user.id,
        req.user.isAdmin,
      );

      res.status(200).json({
        success: true,
        data,
        meta: { page, limit, total },
      });
    } catch (err) {
      next(err);
    }
  }
}

export const stockController = new StockController();
