import { Router } from 'express';
import { categoriesController } from './categories.controller';
import { validateBody } from '../../utils/validation';
import { createCategorySchema, updateCategorySchema } from './categories.validator';
import { AuthenticatedRequest } from '../../types/request.types';

const router = Router();

router.get('/', (req, res, next) =>
  categoriesController.getAll(req as AuthenticatedRequest, res, next)
);

router.post('/', validateBody(createCategorySchema), (req, res, next) =>
  categoriesController.create(req as AuthenticatedRequest, res, next)
);

router.put('/:id', validateBody(updateCategorySchema), (req, res, next) =>
  categoriesController.update(req as AuthenticatedRequest, res, next)
);

export default router;
