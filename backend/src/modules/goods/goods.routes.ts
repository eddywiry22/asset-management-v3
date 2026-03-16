import { Router } from 'express';
import { goodsController } from './goods.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { validateBody } from '../../utils/validation';
import { createGoodsSchema, updateGoodsSchema } from './goods.validator';
import { AuthenticatedRequest } from '../../types/request.types';

const router = Router();

router.use(authMiddleware);

router.get('/', (req, res, next) =>
  goodsController.getAll(req as AuthenticatedRequest, res, next)
);

router.post('/', validateBody(createGoodsSchema), (req, res, next) =>
  goodsController.create(req as AuthenticatedRequest, res, next)
);

router.put('/:id', validateBody(updateGoodsSchema), (req, res, next) =>
  goodsController.update(req as AuthenticatedRequest, res, next)
);

export default router;
