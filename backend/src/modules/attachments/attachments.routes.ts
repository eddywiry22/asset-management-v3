import { Router } from 'express';
import { adminMiddleware } from '../../middlewares/admin.middleware';
import { upload } from '../../middlewares/upload.middleware';
import { attachmentsController } from './attachments.controller';
import { AuthenticatedRequest } from '../../types/request.types';
import { ValidationError } from '../../utils/errors';

const router = Router();

// POST /v1/attachments/:entityType/:entityId — upload a file (admin only)
router.post('/:entityType/:entityId', adminMiddleware, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return next(new ValidationError(err.message));
    attachmentsController.upload(req as unknown as AuthenticatedRequest, res, next);
  });
});

// GET /v1/attachments/:entityType/:entityId — list attachments
router.get('/:entityType/:entityId', (req, res, next) =>
  attachmentsController.list(req as unknown as AuthenticatedRequest, res, next),
);

// DELETE /v1/attachments/:id — delete attachment (admin only, DRAFT requests only)
router.delete('/:id', adminMiddleware, (req, res, next) =>
  attachmentsController.delete(req as unknown as AuthenticatedRequest, res, next),
);

// GET /v1/attachments/:id/download — download file
router.get('/:id/download', (req, res, next) =>
  attachmentsController.download(req as unknown as AuthenticatedRequest, res, next),
);

export default router;
