import { Router } from 'express';
import { auditController } from './audit.controller';
import { AuthenticatedRequest } from '../../types/request.types';

const router = Router();

router.get('/', (req, res, next) =>
  auditController.getAll(req as AuthenticatedRequest, res, next)
);

export default router;
