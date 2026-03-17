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

// Delete DRAFT request
router.delete('/:id', (req, res, next) =>
  transferController.deleteRequest(cast(req), res, next)
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

// Workflow actions
router.post('/:id/submit', (req, res, next) =>
  transferController.submit(cast(req), res, next)
);

router.post('/:id/approve-origin', (req, res, next) =>
  transferController.approveOrigin(cast(req), res, next)
);

router.post('/:id/approve-destination', (req, res, next) =>
  transferController.approveDestination(cast(req), res, next)
);

router.post('/:id/finalize', (req, res, next) =>
  transferController.finalize(cast(req), res, next)
);

router.post('/:id/cancel', (req, res, next) =>
  transferController.cancel(cast(req), res, next)
);

export default router;
