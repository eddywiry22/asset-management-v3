import { Router } from 'express';
import { commentsController } from './comments.controller';
import { AuthenticatedRequest } from '../../types/request.types';

const router = Router();

// POST /v1/comments — create a comment
router.post('/', (req, res, next) =>
  commentsController.create(req as AuthenticatedRequest, res, next),
);

// PATCH /v1/comments/:id — edit a comment (creator only)
router.patch('/:id', (req, res, next) =>
  commentsController.edit(req as unknown as AuthenticatedRequest, res, next),
);

// DELETE /v1/comments/:id — soft delete a comment (creator only)
router.delete('/:id', (req, res, next) =>
  commentsController.delete(req as unknown as AuthenticatedRequest, res, next),
);

export default router;
