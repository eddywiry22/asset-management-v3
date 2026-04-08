import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types/request.types';
import { TimelineService, timelineService } from './timeline.service';

export class TimelineController {
  constructor(private readonly service: TimelineService) {}

  async getTimeline(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { entityType, entityId } = req.params;
      const data = await this.service.getTimeline(entityType, entityId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
}

export const timelineController = new TimelineController(timelineService);
