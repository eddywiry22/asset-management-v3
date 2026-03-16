import { Response, NextFunction } from 'express';
import { uomsService } from './uoms.service';
import { AuthenticatedRequest } from '../../types/request.types';

export class UomsController {
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await uomsService.findAll();
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await uomsService.create(req.body, req.user.id);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
}

export const uomsController = new UomsController();
