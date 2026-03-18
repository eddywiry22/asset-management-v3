import { Response, NextFunction } from 'express';
import { stockService } from './stock.service';
import { stockQuerySchema, ledgerQuerySchema } from './stock.validator';
import { AuthenticatedRequest } from '../../types/request.types';
import { ValidationError } from '../../utils/errors';
import { getRegisteredProductsAtLocation } from '../../utils/validationHelpers';

import prisma from '../../config/database';

// Accepts YYYY-MM-DD or full ISO; always returns UTC start-of-day / end-of-day.
function parseStartDate(s: string): Date {
  return s.includes('T') ? new Date(s) : new Date(s + 'T00:00:00.000Z');
}
function parseEndDate(s: string): Date {
  return s.includes('T') ? new Date(s) : new Date(s + 'T23:59:59.999Z');
}

export class StockController {
  async getVisibleLocations(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      let locations: Array<{ id: string; code: string; name: string; role?: string }>;

      if (req.user.isAdmin) {
        locations = await prisma.location.findMany({
          where:   { isActive: true },
          select:  { id: true, code: true, name: true },
          orderBy: { code: 'asc' },
        });
      } else {
        const roles = await prisma.userLocationRole.findMany({
          where:   { userId: req.user.id },
          include: { location: { select: { id: true, code: true, name: true } } },
        });
        locations = roles
          .map((r) => ({ ...r.location, role: r.role }))
          .sort((a, b) => a.code.localeCompare(b.code));
      }

      res.status(200).json({ success: true, data: locations });
    } catch (err) {
      next(err);
    }
  }
  async getAllLocations(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const locations = await prisma.location.findMany({
        where:   { isActive: true },
        select:  { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
      });
      res.status(200).json({ success: true, data: locations });
    } catch (err) {
      next(err);
    }
  }

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
          startDate: startDate ? parseStartDate(startDate) : undefined,
          endDate:   endDate   ? parseEndDate(endDate)     : undefined,
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

  async getRegisteredProducts(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { locationId } = req.query as { locationId?: string };
      if (!locationId || typeof locationId !== 'string') {
        throw new ValidationError('locationId query parameter is required');
      }
      const products = await getRegisteredProductsAtLocation(locationId);
      res.status(200).json({ success: true, data: products });
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
          startDate: startDate ? parseStartDate(startDate) : undefined,
          endDate:   endDate   ? parseEndDate(endDate)     : undefined,
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
