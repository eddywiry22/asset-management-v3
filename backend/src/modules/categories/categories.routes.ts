import { Router } from 'express';
import { categoriesController } from './categories.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { validateBody } from '../../utils/validation';
import { createCategorySchema, updateCategorySchema } from './categories.validator';
import { AuthenticatedRequest } from '../../types/request.types';
import { Request, Response, NextFunction } from 'express';

const router = Router();

router.use(authMiddleware);

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
