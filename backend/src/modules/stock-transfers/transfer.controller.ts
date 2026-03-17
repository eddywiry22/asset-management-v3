import { Response, NextFunction } from 'express';
import { transferService } from './transfer.service';
import { AuthenticatedRequest } from '../../types/request.types';
import { TransferRequestStatus } from '@prisma/client';
import { ValidationError } from '../../utils/errors';

const VALID_STATUSES = new Set<string>(Object.values(TransferRequestStatus));

export class TransferController {
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page  = parseInt(req.query.page  as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      let status: TransferRequestStatus | undefined;
      if (req.query.status) {
        const raw = req.query.status as string;
        if (!VALID_STATUSES.has(raw)) {
          throw new ValidationError(`Invalid status: ${raw}. Must be one of: ${[...VALID_STATUSES].join(', ')}`);
        }
        status = raw as TransferRequestStatus;
      }

      let startDate: Date | undefined;
      let endDate: Date | undefined;
      if (req.query.startDate) {
        startDate = new Date(req.query.startDate as string);
        if (isNaN(startDate.getTime())) throw new ValidationError('Invalid startDate');
      }
      if (req.query.endDate) {
        endDate = new Date(req.query.endDate as string);
        if (isNaN(endDate.getTime())) throw new ValidationError('Invalid endDate');
      }

      const { data, total } = await transferService.findAll({ status, startDate, endDate, page, limit });
      res.status(200).json({ success: true, data, meta: { page, limit, total } });
    } catch (err) {
      next(err);
    }
  }

  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await transferService.findById(req.params.id);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await transferService.create(req.body, req.user.id);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async addItem(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await transferService.addItem(req.params.id, req.body);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async updateItem(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await transferService.updateItem(req.params.id, req.params.itemId, req.body);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async deleteItem(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await transferService.deleteItem(req.params.id, req.params.itemId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }

  async finalize(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await transferService.finalize(req.params.id, req.user.id);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
}

export const transferController = new TransferController();
