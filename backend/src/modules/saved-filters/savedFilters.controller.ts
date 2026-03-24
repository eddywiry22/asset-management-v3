import { Response, NextFunction } from 'express';
import { savedFiltersService } from './savedFilters.service';
import { AuthenticatedRequest } from '../../types/request.types';
import { ValidationError } from '../../utils/errors';

export class SavedFiltersController {
  async getAll(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { module } = req.query;
      if (!module || typeof module !== 'string') {
        throw new ValidationError('module query param is required');
      }
      const data = await savedFiltersService.getAll(req.user.id, module);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      console.log('Saved filter request body:', req.body);
      console.log('Authenticated user:', req.user);
      const userId = req.user?.id || (req.user as unknown as Record<string, string>)?.userId || (req.user as unknown as Record<string, string>)?.sub;
      const data = await savedFiltersService.create(req.body, userId);
      res.status(201).json({ success: true, data });
    } catch (err) {
      console.error('Saved filter error:', err);
      next(err);
    }
  }

  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await savedFiltersService.delete(req.params.id, req.user.id);
      res.status(200).json({ success: true });
    } catch (err) {
      next(err);
    }
  }
}

export const savedFiltersController = new SavedFiltersController();
