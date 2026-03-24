import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { getMyDashboard, getPreviewController } from './dashboard.controller';

const router = Router();

router.get('/my-actions', authMiddleware, getMyDashboard);
router.get('/preview', authMiddleware, getPreviewController);

export default router;
