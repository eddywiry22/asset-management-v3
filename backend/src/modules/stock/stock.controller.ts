import { Response, NextFunction } from 'express';
import { stockService } from './stock.service';
import { stockQuerySchema, ledgerQuerySchema } from './stock.validator';
import { AuthenticatedRequest } from '../../types/request.types';
import { ValidationError } from '../../utils/errors';

import prisma from '../../config/database';

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

      let parsedEndDate: Date | undefined;
      if (endDate) {
        parsedEndDate = new Date(endDate);
        parsedEndDate.setHours(23, 59, 59, 999);
      }

      const { data, total } = await stockService.getStockOverview(
        {
          locationId,
          page,
          limit,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate:   parsedEndDate,
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

      let parsedLedgerEndDate: Date | undefined;
      if (endDate) {
        parsedLedgerEndDate = new Date(endDate);
        parsedLedgerEndDate.setHours(23, 59, 59, 999);
      }

      const { data, total } = await stockService.getLedger(
        {
          productId,
          locationId,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate:   parsedLedgerEndDate,
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
