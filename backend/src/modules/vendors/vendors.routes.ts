import { Router } from 'express';
import { vendorsController } from './vendors.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { validateBody } from '../../utils/validation';
import { createVendorSchema, updateVendorSchema } from './vendors.validator';
import { AuthenticatedRequest } from '../../types/request.types';

const router = Router();

router.use(authMiddleware);

router.get('/', (req, res, next) =>
  vendorsController.getAll(req as AuthenticatedRequest, res, next)
);

router.post('/', validateBody(createVendorSchema), (req, res, next) =>
  vendorsController.create(req as AuthenticatedRequest, res, next)
);

router.put('/:id', validateBody(updateVendorSchema), (req, res, next) =>
  vendorsController.update(req as AuthenticatedRequest, res, next)
);

export default router;
