import { Response, NextFunction } from 'express';
import { stockAdjustmentService } from './stockAdjustment.service';
import { AuthenticatedRequest } from '../../types/request.types';
import { AdjustmentRequestStatus } from '@prisma/client';
import prisma from '../../config/database';
import { ValidationError } from '../../utils/errors';

const VALID_STATUSES = new Set<string>(Object.values(AdjustmentRequestStatus));

export class StockAdjustmentController {
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page  = parseInt(req.query.page  as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      // W5: validate status
      let status: AdjustmentRequestStatus | undefined;
      if (req.query.status) {
        const raw = req.query.status as string;
        if (!VALID_STATUSES.has(raw)) {
          throw new ValidationError(`Invalid status: ${raw}. Must be one of: ${[...VALID_STATUSES].join(', ')}`);
        }
        status = raw as AdjustmentRequestStatus;
      }

      // W6: validate dates
      let startDate: Date | undefined;
      let endDate: Date | undefined;
      if (req.query.startDate) {
        startDate = new Date(req.query.startDate as string);
        if (isNaN(startDate.getTime())) throw new ValidationError('Invalid startDate');
      }
      if (req.query.endDate) {
        endDate = new Date(req.query.endDate as string);
        if (isNaN(endDate.getTime())) throw new ValidationError('Invalid endDate');
        // Include the full end day
        endDate.setHours(23, 59, 59, 999);
      }

      // Admin-only explicit location filter
      let filterLocationId: string | undefined;
      if (req.user.isAdmin && req.query.locationId) {
        filterLocationId = req.query.locationId as string;
      }

      const user = { id: req.user.id, isAdmin: req.user.isAdmin };
      const { data, total } = await stockAdjustmentService.findAll({ status, startDate, endDate, page, limit, user, filterLocationId });
      res.status(200).json({ success: true, data, meta: { page, limit, total } });
    } catch (err) {
      next(err);
    }
  }

  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await stockAdjustmentService.findById(req.params.id);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await stockAdjustmentService.create(req.body, req.user.id);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async addItem(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = { id: req.user.id, isAdmin: req.user.isAdmin };
      const data = await stockAdjustmentService.addItem(req.params.id, req.body, user);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async updateItem(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = { id: req.user.id, isAdmin: req.user.isAdmin };
      const data = await stockAdjustmentService.updateItem(req.params.id, req.params.itemId, req.body, user);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async deleteItem(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = { id: req.user.id, isAdmin: req.user.isAdmin };
      await stockAdjustmentService.deleteItem(req.params.id, req.params.itemId, user);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }

  async submit(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await stockAdjustmentService.submit(req.params.id, req.user.id);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async approve(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const roles = await prisma.userLocationRole.findMany({
        where: { userId: req.user.id },
        select: { role: true },
      });
      const locationRoles = roles.map((r) => r.role);
      const data = await stockAdjustmentService.approve(req.params.id, req.user.id, {
        isAdmin: req.user.isAdmin,
        locationRoles,
      });
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async reject(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const roles = await prisma.userLocationRole.findMany({
        where: { userId: req.user.id },
        select: { role: true },
      });
      const locationRoles = roles.map((r) => r.role);
      const data = await stockAdjustmentService.reject(req.params.id, req.user.id, {
        isAdmin: req.user.isAdmin,
        locationRoles,
      }, req.body?.notes);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async finalize(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = { id: req.user.id, isAdmin: req.user.isAdmin };
      const data = await stockAdjustmentService.finalize(req.params.id, req.user.id, user);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async cancel(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = { id: req.user.id, isAdmin: req.user.isAdmin };
      const data = await stockAdjustmentService.cancel(req.params.id, user);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
}

export const stockAdjustmentController = new StockAdjustmentController();
