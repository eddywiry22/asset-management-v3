import { Router } from 'express';
import { transferController } from './transfer.controller';
import { validateBody } from '../../utils/validation';
import { createTransferSchema, addItemSchema, updateItemSchema } from './transfer.validator';
import { AuthenticatedRequest } from '../../types/request.types';

const router = Router();
const cast = (req: any) => req as AuthenticatedRequest;

// List and get
router.get('/', (req, res, next) =>
  transferController.getAll(cast(req), res, next)
);

router.get('/:id', (req, res, next) =>
  transferController.getById(cast(req), res, next)
);

// Create DRAFT request
router.post('/', validateBody(createTransferSchema), (req, res, next) =>
  transferController.create(cast(req), res, next)
);

// Item management
router.post('/:id/items', validateBody(addItemSchema), (req, res, next) =>
  transferController.addItem(cast(req), res, next)
);

router.put('/:id/items/:itemId', validateBody(updateItemSchema), (req, res, next) =>
  transferController.updateItem(cast(req), res, next)
);

router.delete('/:id/items/:itemId', (req, res, next) =>
  transferController.deleteItem(cast(req), res, next)
);

// Finalize
router.post('/:id/finalize', (req, res, next) =>
  transferController.finalize(cast(req), res, next)
);

export default router;
