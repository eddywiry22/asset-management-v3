import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types/request.types';
import { CommentsService, commentsService } from './comments.service';

export class CommentsController {
  constructor(private readonly service: CommentsService) {}

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { entityType, entityId, message } = req.body;
      const data = await this.service.createComment(entityType, entityId, message, req.user.id);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async edit(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { message } = req.body;
      const data = await this.service.editComment(id, message, req.user.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const data = await this.service.deleteComment(id, req.user.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
}

export const commentsController = new CommentsController(commentsService);
