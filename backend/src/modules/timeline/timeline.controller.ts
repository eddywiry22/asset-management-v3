import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types/request.types';
import { TimelineService, timelineService } from './timeline.service';
import { registerSSEClient, unregisterSSEClient } from './timeline.sse';
import { authService } from '../auth/auth.service';

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

  streamTimeline(req: Request, res: Response): void {
    // --- Manual JWT auth (EventSource cannot send Authorization headers) ---
    const token = req.query.token as string;

    if (!token) {
      res.status(401).end();
      return;
    }

    let user: ReturnType<typeof authService.verifyAccessToken>;
    try {
      user = authService.verifyAccessToken(token);
    } catch (err) {
      console.error('SSE auth failed:', err);
      res.status(401).end();
      return;
    }

    // Attach user so downstream code can access it if needed
    (req as any).user = {
      id:      user.sub,
      email:   user.email,
      phone:   user.phone,
      isAdmin: user.isAdmin ?? false,
    };
    // --- End auth ---

    const { entityType, entityId } = req.params;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    console.log('SSE CLIENT CONNECTED:', {
      entityType,
      entityId,
      userId: user.sub,
    });

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
