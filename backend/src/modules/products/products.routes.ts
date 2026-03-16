import { Router } from 'express';
import { productsController } from './products.controller';
import { validateBody } from '../../utils/validation';
import { createProductSchema, updateProductSchema } from './products.validator';
import { AuthenticatedRequest } from '../../types/request.types';

const router = Router();

router.get('/', (req, res, next) =>
  productsController.getAll(req as AuthenticatedRequest, res, next)
);

router.post('/', validateBody(createProductSchema), (req, res, next) =>
  productsController.create(req as AuthenticatedRequest, res, next)
);

router.put('/:id', validateBody(updateProductSchema), (req, res, next) =>
  productsController.update(req as AuthenticatedRequest, res, next)
);

export default router;
