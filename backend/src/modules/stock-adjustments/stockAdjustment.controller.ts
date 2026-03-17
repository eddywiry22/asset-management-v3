import { Response, NextFunction } from 'express';
import { stockAdjustmentService } from './stockAdjustment.service';
import { AuthenticatedRequest } from '../../types/request.types';
import { AdjustmentRequestStatus } from '@prisma/client';
import prisma from '../../config/database';

export class StockAdjustmentController {
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page   = parseInt(req.query.page  as string) || 1;
      const limit  = parseInt(req.query.limit as string) || 20;
      const status = req.query.status as AdjustmentRequestStatus | undefined;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate   = req.query.endDate   ? new Date(req.query.endDate   as string) : undefined;

      const { data, total } = await stockAdjustmentService.findAll({ status, startDate, endDate, page, limit });
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
      const data = await stockAdjustmentService.addItem(req.params.id, req.body);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async updateItem(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await stockAdjustmentService.updateItem(req.params.id, req.params.itemId, req.body);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async deleteItem(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await stockAdjustmentService.deleteItem(req.params.id, req.params.itemId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }

  async submit(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await stockAdjustmentService.submit(req.params.id);
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
      const data = await stockAdjustmentService.finalize(req.params.id, req.user.id);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
}

export const stockAdjustmentController = new StockAdjustmentController();
