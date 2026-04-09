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
    const key = `${entityType}:${entityId}`;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    console.log('SSE CLIENT CONNECTED:', key);

    registerSSEClient(entityType, entityId, res);

    // Heartbeat every 15 s to keep the connection alive through proxies
    const heartbeat = setInterval(() => {
      try {
        res.write(': keep-alive\n\n');
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
      } catch {
        clearInterval(heartbeat);
      }
    }, 15_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unregisterSSEClient(entityType, entityId, res);
    });
  }
}

export const timelineController = new TimelineController(timelineService);
