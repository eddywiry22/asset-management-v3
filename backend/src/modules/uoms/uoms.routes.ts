import { Router } from 'express';
import { uomsController } from './uoms.controller';
import { validateBody } from '../../utils/validation';
import { createUomSchema } from './uoms.validator';
import { AuthenticatedRequest } from '../../types/request.types';

const router = Router();

router.get('/', (req, res, next) =>
  uomsController.getAll(req as AuthenticatedRequest, res, next)
);

router.post('/', validateBody(createUomSchema), (req, res, next) =>
  uomsController.create(req as AuthenticatedRequest, res, next)
);

export default router;
