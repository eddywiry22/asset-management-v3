import { Router } from 'express';
import { productLocationController } from './productRegistration.controller';
import { validateBody } from '../../utils/validation';
import { createProductRegistrationSchema, updateProductRegistrationSchema, bulkToggleSchema } from './productRegistration.validator';
import { AuthenticatedRequest } from '../../types/request.types';

const router = Router();

router.get('/', (req, res, next) =>
  productLocationController.getAll(req as AuthenticatedRequest, res, next)
);

router.post('/bulk-toggle', validateBody(bulkToggleSchema), (req, res, next) =>
  productLocationController.bulkToggle(req as AuthenticatedRequest, res, next)
);

router.post('/', validateBody(createProductRegistrationSchema), (req, res, next) =>
  productLocationController.create(req as AuthenticatedRequest, res, next)
);

router.get('/:id/check-deactivate', (req, res, next) =>
  productLocationController.checkDeactivation(req as unknown as AuthenticatedRequest, res, next)
);

router.put('/:id', validateBody(updateProductRegistrationSchema), (req, res, next) =>
  productLocationController.update(req as AuthenticatedRequest, res, next)
);

router.delete('/:id', (req, res, next) =>
  productLocationController.delete(req as unknown as AuthenticatedRequest, res, next)
);

export default router;
