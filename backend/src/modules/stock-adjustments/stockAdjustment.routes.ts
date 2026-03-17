import { Router } from 'express';
import { stockAdjustmentController } from './stockAdjustment.controller';
import { validateBody } from '../../utils/validation';
import {
  createRequestSchema,
  addItemSchema,
  updateItemSchema,
  rejectRequestSchema,
} from './stockAdjustment.validator';
import { AuthenticatedRequest } from '../../types/request.types';

const router = Router();
const cast = (req: any) => req as AuthenticatedRequest;

// List and get
router.get('/', (req, res, next) =>
  stockAdjustmentController.getAll(cast(req), res, next)
);

router.get('/:id', (req, res, next) =>
  stockAdjustmentController.getById(cast(req), res, next)
);

// Create request
router.post('/', validateBody(createRequestSchema), (req, res, next) =>
  stockAdjustmentController.create(cast(req), res, next)
);

// Item management
router.post('/:id/items', validateBody(addItemSchema), (req, res, next) =>
  stockAdjustmentController.addItem(cast(req), res, next)
);

router.put('/:id/items/:itemId', validateBody(updateItemSchema), (req, res, next) =>
  stockAdjustmentController.updateItem(cast(req), res, next)
);

router.delete('/:id/items/:itemId', (req, res, next) =>
  stockAdjustmentController.deleteItem(cast(req), res, next)
);

// Workflow actions
router.post('/:id/submit', (req, res, next) =>
  stockAdjustmentController.submit(cast(req), res, next)
);

router.post('/:id/approve', (req, res, next) =>
  stockAdjustmentController.approve(cast(req), res, next)
);

router.post('/:id/reject', validateBody(rejectRequestSchema), (req, res, next) =>
  stockAdjustmentController.reject(cast(req), res, next)
);

router.post('/:id/finalize', (req, res, next) =>
  stockAdjustmentController.finalize(cast(req), res, next)
);

export default router;
