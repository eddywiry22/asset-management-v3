import { Router } from 'express';
import { uomsController } from './uoms.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { validateBody } from '../../utils/validation';
import { createUomSchema } from './uoms.validator';
import { AuthenticatedRequest } from '../../types/request.types';

const router = Router();

router.use(authMiddleware);

router.get('/', (req, res, next) =>
  uomsController.getAll(req as AuthenticatedRequest, res, next)
);

router.post('/', validateBody(createUomSchema), (req, res, next) =>
  uomsController.create(req as AuthenticatedRequest, res, next)
);

export default router;
