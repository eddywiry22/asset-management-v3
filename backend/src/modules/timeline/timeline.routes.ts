import { Router } from 'express';
import { timelineController } from './timeline.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { AuthenticatedRequest } from '../../types/request.types';

const router = Router();

// GET /v1/timeline/stream/:entityType/:entityId — SSE real-time stream.
// Auth middleware is intentionally omitted here; the controller validates the
// JWT manually from the ?token= query param (EventSource cannot send headers).
router.get('/stream/:entityType/:entityId', (req, res) =>
  timelineController.streamTimeline(req as unknown as AuthenticatedRequest, res),
);

// GET /v1/timeline/:entityType/:entityId — get unified activity timeline (REST)
router.get('/:entityType/:entityId', authMiddleware, (req, res, next) =>
  timelineController.getTimeline(req as unknown as AuthenticatedRequest, res, next),
);

export default router;
