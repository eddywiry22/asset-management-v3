import { Response, NextFunction } from 'express';
import { stockService } from './stock.service';
import { stockQuerySchema, ledgerQuerySchema } from './stock.validator';
import { AuthenticatedRequest } from '../../types/request.types';
import { ValidationError } from '../../utils/errors';
import { getRegisteredProductsAtLocation } from '../../utils/validationHelpers';
import { evaluateLocationReadiness } from '../locations/locationReadiness.service';

import prisma from '../../config/database';
import { buildDateRangeFilter } from '../../utils/dateFilter';

export class StockController {
  async getVisibleLocations(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      let locations: Array<{ id: string; code: string; name: string; isActive: boolean; role?: string }>;

      if (req.user.isAdmin) {
        // Stage 8.4.2: admins see all locations (including inactive) for visibility
        locations = await prisma.location.findMany({
          select:  { id: true, code: true, name: true, isActive: true },
          orderBy: { code: 'asc' },
        });
      } else {
        const roles = await prisma.userLocationRole.findMany({
          where:   { userId: req.user.id },
          include: { location: { select: { id: true, code: true, name: true, isActive: true } } },
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

      const { locationId, productId, page, limit, startDate, endDate } = parsed.data;

      // Normalise: start → 00:00:00.000, end → 23:59:59.999 (inclusive end-of-day)
      const overviewDateFilter = buildDateRangeFilter(startDate, endDate);

      const { data, total } = await stockService.getStockOverview(
        {
          locationId,
          productId,
          page,
          limit,
          startDate: overviewDateFilter?.gte,
          endDate:   overviewDateFilter?.lte,
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

  async getLocationReadiness(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { locationId } = req.query as { locationId?: string };
      if (!locationId || typeof locationId !== 'string') {
        throw new ValidationError('locationId query parameter is required');
      }
      const data = await evaluateLocationReadiness(locationId);
      res.status(200).json({ success: true, data });
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

      // Normalise: start → 00:00:00.000, end → 23:59:59.999 (inclusive end-of-day)
      const ledgerDateFilter = buildDateRangeFilter(startDate, endDate);

      const { data, total } = await stockService.getLedger(
        {
          productId,
          locationId,
          startDate: ledgerDateFilter?.gte,
          endDate:   ledgerDateFilter?.lte,
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
