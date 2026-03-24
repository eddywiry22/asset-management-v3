import { Router } from 'express';
import { savedFiltersController } from './savedFilters.controller';
import { validateBody } from '../../utils/validation';
import { createSavedFilterSchema } from './savedFilters.validator';
import { AuthenticatedRequest } from '../../types/request.types';

const router = Router();

router.get('/', (req, res, next) =>
  savedFiltersController.getAll(req as AuthenticatedRequest, res, next)
);

router.post('/', validateBody(createSavedFilterSchema), (req, res, next) =>
  savedFiltersController.create(req as AuthenticatedRequest, res, next)
);

router.delete('/:id', (req, res, next) =>
  savedFiltersController.delete(req as AuthenticatedRequest, res, next)
);

export default router;
