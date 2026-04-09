import { Router } from 'express';
import { timelineController } from './timeline.controller';
import { AuthenticatedRequest } from '../../types/request.types';

const router = Router();

// GET /v1/timeline/stream/:entityType/:entityId — SSE real-time timeline stream
router.get('/stream/:entityType/:entityId', (req, res) =>
  timelineController.streamTimeline(req as unknown as AuthenticatedRequest, res),
);

// GET /v1/timeline/:entityType/:entityId — get unified activity timeline
router.get('/:entityType/:entityId', (req, res, next) =>
  timelineController.getTimeline(req as unknown as AuthenticatedRequest, res, next),
);

export default router;
