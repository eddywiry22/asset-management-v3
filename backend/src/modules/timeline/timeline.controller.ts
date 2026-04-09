import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types/request.types';
import { TimelineService, timelineService } from './timeline.service';
import { registerSSEClient, unregisterSSEClient } from './timeline.sse';

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

  streamTimeline(req: AuthenticatedRequest, res: Response): void {
    const { entityType, entityId } = req.params;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    registerSSEClient(entityType, entityId, res);

    req.on('close', () => {
      unregisterSSEClient(entityType, entityId, res);
    });
  }
}

export const timelineController = new TimelineController(timelineService);
